import type Database from 'better-sqlite3'
import type { ModelInfoRepository } from '@domain/repositories'
import type { ModelKind } from '@shared/generation-kinds'
import type { CivitaiInfo } from '@shared/model-civitai'
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
  civitai_id: number | null
  base_model: string | null
  custom_base_model: string | null
  custom_words: string | null
  civitai_words: string | null
  strength: number | null
  custom_description: string | null
  notes: string | null
  civitai_model_id: number | null
  civitai_version_id: number | null
  civitai_model_name: string | null
  civitai_version_name: string | null
  civitai_base_model: string | null
  civitai_description: string | null
  civitai_version_description: string | null
  civitai_creator: string | null
  civitai_nsfw: number | null
  civitai_tags: string | null
  civitai_downloads: number | null
  civitai_thumbs_up: number | null
  civitai_published_at: string | null
  civitai_fetched_at: number | null
}

// Models the library's images use, then those added by hand that no image uses (the models
// row is pruned once unused, so a model can have an entry and no row, or a row and no entry).
// What the user wrote and what Civitai said sit side by side: base_model is the user's when set,
// else Civitai's; image counts are added only for the rows a query returns.
const ENTRIES = `
  WITH catalog AS (
    SELECT m.id AS model_id, m.kind, m.identity, m.display_name AS name FROM models m
    UNION ALL
    SELECT NULL, i.kind, i.identity, i.display_name FROM model_info i
    WHERE NOT EXISTS (SELECT 1 FROM models m WHERE m.kind = i.kind AND m.identity = i.identity)
  ),
  entries AS (
    SELECT c.model_id, c.kind, c.identity, c.name,
      i.id AS info_id, v.id AS civitai_id,
      COALESCE(i.base_model, v.base_model) AS base_model,
      i.base_model AS custom_base_model,
      i.trigger_words_json AS custom_words, v.trigger_words_json AS civitai_words,
      i.strength, i.description AS custom_description, i.notes,
      v.civitai_model_id, v.civitai_version_id,
      v.model_name AS civitai_model_name, v.version_name AS civitai_version_name,
      v.base_model AS civitai_base_model, v.description AS civitai_description,
      v.version_description AS civitai_version_description, v.creator AS civitai_creator,
      v.nsfw AS civitai_nsfw, v.tags_json AS civitai_tags, v.downloads AS civitai_downloads,
      v.thumbs_up AS civitai_thumbs_up, v.published_at AS civitai_published_at,
      v.fetched_at AS civitai_fetched_at
    FROM catalog c
    LEFT JOIN model_info i ON i.kind = c.kind AND i.identity = c.identity
    LEFT JOIN model_civitai v ON v.kind = c.kind AND v.identity = c.identity
  )`

// An absent filter is NULL (or 0), so the statement's text never depends on the query. Text is
// folded by fold(), not SQLite's lower(), which folds ASCII only and would never match `Über`
// typed as `über`; the query is folded the same way in list().
const MATCHING = `
  FROM entries
  WHERE (@kind IS NULL OR kind = @kind)
    AND (@baseModel IS NULL OR fold(base_model) = fold(@baseModel))
    AND (@withoutInfo = 0 OR (info_id IS NULL AND civitai_id IS NULL))
    AND (@text IS NULL
      OR instr(fold(name), @text) > 0
      OR instr(fold(COALESCE(base_model, '')), @text) > 0
      OR EXISTS (SELECT 1 FROM json_each(COALESCE(custom_words, '[]')) word
                 WHERE instr(fold(word.value), @text) > 0)
      OR EXISTS (SELECT 1 FROM json_each(COALESCE(civitai_words, '[]')) word
                 WHERE instr(fold(word.value), @text) > 0)
      OR instr(fold(COALESCE(custom_description, '')), @text) > 0
      OR instr(fold(COALESCE(civitai_description, '')), @text) > 0
      OR instr(fold(COALESCE(civitai_version_description, '')), @text) > 0
      OR instr(fold(COALESCE(notes, '')), @text) > 0)`

const IMAGE_COUNT = `
  CASE e.kind
    WHEN 'lora' THEN
      (SELECT COUNT(DISTINCT image_id) FROM generation_loras WHERE model_id = e.model_id)
    ELSE
      (SELECT COUNT(*) FROM generations
       WHERE checkpoint_id = e.model_id OR refiner_id = e.model_id)
  END`

const words = (json: string | null): string[] => (json ? (JSON.parse(json) as string[]) : [])

/** The user's words first, then Civitai's that they don't already have. */
function allWords(custom: string[], fetched: string[]): string[] {
  const seen = new Set(custom.map((word) => word.toLowerCase()))
  return [...custom, ...fetched.filter((word) => !seen.has(word.toLowerCase()))]
}

const entryOf = (row: EntryRow): ModelEntry => ({
  kind: row.kind,
  identity: row.identity,
  name: row.name,
  imageCount: row.image_count,
  hasInfo: row.info_id !== null || row.civitai_id !== null,
  baseModel: row.base_model,
  triggerWords: allWords(words(row.custom_words), words(row.civitai_words)),
  strength: row.strength
})

function civitaiOf(row: EntryRow): CivitaiInfo | null {
  if (row.civitai_id === null) return null
  return {
    modelId: row.civitai_model_id ?? 0,
    versionId: row.civitai_version_id ?? 0,
    modelName: row.civitai_model_name ?? '',
    versionName: row.civitai_version_name ?? '',
    baseModel: row.civitai_base_model,
    triggerWords: words(row.civitai_words),
    description: row.civitai_description,
    versionDescription: row.civitai_version_description,
    creator: row.civitai_creator,
    nsfw: row.civitai_nsfw === 1,
    tags: words(row.civitai_tags),
    downloads: row.civitai_downloads,
    thumbsUp: row.civitai_thumbs_up,
    publishedAt: row.civitai_published_at,
    fetchedAt: row.civitai_fetched_at ?? 0
  }
}

const detailOf = (row: EntryRow): ModelDetail => ({
  ...entryOf(row),
  custom: {
    baseModel: row.custom_base_model,
    triggerWords: words(row.custom_words),
    strength: row.strength,
    description: row.custom_description,
    notes: row.notes
  },
  civitai: civitaiOf(row)
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
      `${ENTRIES}
       SELECT e.*, ${IMAGE_COUNT} AS image_count FROM (
         SELECT * ${MATCHING}
         ORDER BY name COLLATE NOCASE, kind, identity LIMIT @limit OFFSET @offset
       ) e
       ORDER BY e.name COLLATE NOCASE, e.kind, e.identity`
    )
    this.countMatching = db.prepare(`${ENTRIES} SELECT COUNT(*) AS total ${MATCHING}`)
    this.selectBaseModels = db
      .prepare(
        `${ENTRIES} SELECT MIN(base_model) FROM entries WHERE base_model IS NOT NULL
         GROUP BY fold(base_model) ORDER BY 1 COLLATE NOCASE`
      )
      .pluck()
    this.selectOne = db.prepare(
      `${ENTRIES}
       SELECT e.*, ${IMAGE_COUNT} AS image_count
       FROM (SELECT * FROM entries WHERE kind = ? AND identity = ?) e`
    )
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
