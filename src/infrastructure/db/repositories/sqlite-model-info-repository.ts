import type Database from 'better-sqlite3'
import type { ModelInfoRepository } from '@domain/repositories'
import type { ModelKind } from '@shared/generation-kinds'
import type {
  ModelDetail,
  ModelEntry,
  ModelFields,
  ModelKey,
  ModelList,
  ModelListQuery
} from '@shared/models'

interface EntryRow {
  kind: ModelKind
  identity: string
  name: string
  image_count: number
  info_id: number | null
  base_model: string | null
  trigger_words_json: string | null
  strength: number | null
  description: string | null
  notes: string | null
}

// Models the library's images use, then those added by hand that no image uses (the models
// row is pruned once unused, so a model can have an entry and no row, or a row and no entry).
const ENTRIES = `
  WITH catalog AS (
    SELECT m.id AS model_id, m.kind, m.identity, m.display_name AS name FROM models m
    UNION ALL
    SELECT NULL, i.kind, i.identity, i.display_name FROM model_info i
    WHERE NOT EXISTS (SELECT 1 FROM models m WHERE m.kind = i.kind AND m.identity = i.identity)
  ),
  entries AS (
    SELECT c.kind, c.identity, c.name,
      CASE c.kind
        WHEN 'lora' THEN
          (SELECT COUNT(DISTINCT image_id) FROM generation_loras WHERE model_id = c.model_id)
        ELSE
          (SELECT COUNT(*) FROM generations
           WHERE checkpoint_id = c.model_id OR refiner_id = c.model_id)
      END AS image_count,
      i.id AS info_id, i.base_model, i.trigger_words_json, i.strength, i.description, i.notes
    FROM catalog c
    LEFT JOIN model_info i ON i.kind = c.kind AND i.identity = c.identity
  )`

// An absent filter is NULL (or 0), so the statement's text never depends on the query. Text is
// folded by fold(), not SQLite's lower(), which folds ASCII only and would never match `Über`
// typed as `über`; the query is folded the same way in list().
const MATCHING = `
  FROM entries
  WHERE (@kind IS NULL OR kind = @kind)
    AND (@baseModel IS NULL OR fold(base_model) = fold(@baseModel))
    AND (@withoutInfo = 0 OR info_id IS NULL)
    AND (@text IS NULL
      OR instr(fold(name), @text) > 0
      OR instr(fold(COALESCE(base_model, '')), @text) > 0
      OR EXISTS (SELECT 1 FROM json_each(trigger_words_json) word WHERE instr(fold(word.value), @text) > 0)
      OR instr(fold(COALESCE(description, '')), @text) > 0
      OR instr(fold(COALESCE(notes, '')), @text) > 0)`

const entryOf = (row: EntryRow): ModelEntry => ({
  kind: row.kind,
  identity: row.identity,
  name: row.name,
  imageCount: row.image_count,
  hasInfo: row.info_id !== null,
  baseModel: row.base_model,
  triggerWords: row.trigger_words_json ? (JSON.parse(row.trigger_words_json) as string[]) : [],
  strength: row.strength
})

const detailOf = (row: EntryRow): ModelDetail => ({
  ...entryOf(row),
  description: row.description,
  notes: row.notes
})

export class SqliteModelInfoRepository implements ModelInfoRepository {
  private readonly selectPage: Database.Statement
  private readonly countMatching: Database.Statement
  private readonly selectBaseModels: Database.Statement
  private readonly selectOne: Database.Statement
  private readonly update: Database.Statement
  private readonly insertFromLibrary: Database.Statement
  private readonly insertNew: Database.Statement
  private readonly deleteEntry: Database.Statement

  constructor(private readonly db: Database.Database) {
    db.function('fold', { deterministic: true }, (text: unknown) =>
      typeof text === 'string' ? text.toLowerCase() : text
    )
    this.selectPage = db.prepare(
      `${ENTRIES} SELECT * ${MATCHING}
       ORDER BY name COLLATE NOCASE, kind, identity LIMIT @limit OFFSET @offset`
    )
    this.countMatching = db.prepare(`${ENTRIES} SELECT COUNT(*) AS total ${MATCHING}`)
    this.selectBaseModels = db
      .prepare(
        `SELECT MIN(base_model) FROM model_info WHERE base_model IS NOT NULL
         GROUP BY fold(base_model) ORDER BY 1 COLLATE NOCASE`
      )
      .pluck()
    this.selectOne = db.prepare(`${ENTRIES} SELECT * FROM entries WHERE kind = ? AND identity = ?`)
    const columns = `base_model = @baseModel, trigger_words_json = @triggerWords,
      strength = @strength, description = @description, notes = @notes, updated_at = @now`
    this.update = db.prepare(
      `UPDATE model_info SET ${columns} WHERE kind = @kind AND identity = @identity`
    )
    const values = `@baseModel, @triggerWords, @strength, @description, @notes, @now, @now`
    const fields = `base_model, trigger_words_json, strength, description, notes,
      created_at, updated_at`
    this.insertFromLibrary = db.prepare(
      `INSERT INTO model_info (kind, identity, display_name, ${fields})
       SELECT kind, identity, display_name, ${values}
       FROM models WHERE kind = @kind AND identity = @identity`
    )
    this.insertNew = db.prepare(
      `INSERT INTO model_info (kind, identity, display_name, ${fields})
       VALUES (@kind, @identity, @name, ${values})
       ON CONFLICT (kind, identity) DO NOTHING`
    )
    this.deleteEntry = db.prepare('DELETE FROM model_info WHERE kind = ? AND identity = ?')
  }

  list(query: ModelListQuery): ModelList {
    const text = query.text?.trim().toLowerCase()
    const filters = {
      kind: query.kind ?? null,
      baseModel: query.baseModel ?? null,
      withoutInfo: query.withoutInfo ? 1 : 0,
      text: text ? text : null
    }
    return this.db.transaction(() => ({
      total: (this.countMatching.get(filters) as { total: number }).total,
      items: (
        this.selectPage.all({ ...filters, limit: query.limit, offset: query.offset }) as EntryRow[]
      ).map(entryOf),
      baseModels: this.selectBaseModels.all() as string[]
    }))()
  }

  find({ kind, identity }: ModelKey): ModelDetail | undefined {
    const row = this.selectOne.get(kind, identity) as EntryRow | undefined
    return row && detailOf(row)
  }

  save({ kind, identity }: ModelKey, fields: ModelFields, now: number): boolean {
    const params = { kind, identity, ...this.columnsOf(fields), now }
    return this.db.transaction(
      () => this.update.run(params).changes > 0 || this.insertFromLibrary.run(params).changes > 0
    )()
  }

  create({ kind, identity }: ModelKey, name: string, fields: ModelFields, now: number): boolean {
    return this.insertNew.run({ kind, identity, name, ...this.columnsOf(fields), now }).changes > 0
  }

  clear({ kind, identity }: ModelKey): boolean {
    return this.deleteEntry.run(kind, identity).changes > 0
  }

  private columnsOf(fields: ModelFields): Record<string, unknown> {
    return {
      baseModel: fields.baseModel,
      triggerWords: JSON.stringify(fields.triggerWords),
      strength: fields.strength,
      description: fields.description,
      notes: fields.notes
    }
  }
}
