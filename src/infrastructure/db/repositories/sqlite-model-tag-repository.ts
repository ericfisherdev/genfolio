import type Database from 'better-sqlite3'
import { nameKey } from '@shared/name-key'
import type { ModelKey } from '@shared/models'
import {
  DuplicateModelTagError,
  type ModelTagRecord,
  type ModelTagRepository,
  UnknownModelTagError
} from '@domain/repositories'

interface ModelTagRow {
  id: number
  name: string
  model_count: number
}

// Only links to listed models count: a model with a models row, or one added by hand. A link
// whose model was pruned stays, uncounted, until a model of that key is listed again.
const COUNTED = `
  SELECT model_tags.id, model_tags.name, COUNT(model_tag_links.tag_id) AS model_count
  FROM model_tags LEFT JOIN model_tag_links
    ON model_tag_links.tag_id = model_tags.id
    AND (EXISTS (SELECT 1 FROM models m
                 WHERE m.kind = model_tag_links.kind AND m.identity = model_tag_links.identity)
      OR EXISTS (SELECT 1 FROM model_info i
                 WHERE i.kind = model_tag_links.kind AND i.identity = model_tag_links.identity))`

const recordOf = (row: ModelTagRow): ModelTagRecord => ({
  id: row.id,
  name: row.name,
  modelCount: row.model_count
})

export class SqliteModelTagRepository implements ModelTagRepository {
  private readonly selectAll: Database.Statement<[], ModelTagRow>
  private readonly selectOf: Database.Statement<[string, string], ModelTagRow>
  private readonly selectById: Database.Statement<[number], ModelTagRow>
  private readonly selectByKey: Database.Statement<[string], ModelTagRow>
  private readonly insert: Database.Statement<[string, string, number], { id: number }>
  private readonly updateName: Database.Statement<[string, string, number]>
  private readonly deleteTag: Database.Statement<[number]>
  private readonly modelIsListed: Database.Statement<[string, string, string, string], 1>
  private readonly link: Database.Statement<[number, string, string, number]>
  private readonly unlink: Database.Statement<[number, string, string]>

  constructor(private readonly db: Database.Database) {
    this.selectAll = db.prepare(
      `${COUNTED} GROUP BY model_tags.id ORDER BY model_tags.name_key, model_tags.id`
    )
    this.selectOf = db.prepare(`${COUNTED}
      WHERE model_tags.id IN (SELECT tag_id FROM model_tag_links WHERE kind = ? AND identity = ?)
      GROUP BY model_tags.id ORDER BY model_tags.name_key, model_tags.id`)
    this.selectById = db.prepare(`${COUNTED} WHERE model_tags.id = ? GROUP BY model_tags.id`)
    this.selectByKey = db.prepare(`${COUNTED} WHERE model_tags.name_key = ? GROUP BY model_tags.id`)
    this.insert = db.prepare(
      'INSERT INTO model_tags (name, name_key, created_at) VALUES (?, ?, ?) RETURNING id'
    )
    this.updateName = db.prepare('UPDATE model_tags SET name = ?, name_key = ? WHERE id = ?')
    this.deleteTag = db.prepare('DELETE FROM model_tags WHERE id = ?')
    this.modelIsListed = db
      .prepare(
        `SELECT 1 WHERE EXISTS (SELECT 1 FROM models WHERE kind = ? AND identity = ?)
           OR EXISTS (SELECT 1 FROM model_info WHERE kind = ? AND identity = ?)`
      )
      .pluck() as Database.Statement<[string, string, string, string], 1>
    this.link = db.prepare(
      `INSERT OR IGNORE INTO model_tag_links (tag_id, kind, identity, created_at)
       VALUES (?, ?, ?, ?)`
    )
    this.unlink = db.prepare(
      'DELETE FROM model_tag_links WHERE tag_id = ? AND kind = ? AND identity = ?'
    )
  }

  list(): ModelTagRecord[] {
    return this.selectAll.all().map(recordOf)
  }

  tagsOf({ kind, identity }: ModelKey): ModelTagRecord[] {
    return this.selectOf.all(kind, identity).map(recordOf)
  }

  create(name: string, createdAt: number): ModelTagRecord {
    return this.db.transaction(() => {
      const existing = this.findByName(name)
      if (existing) throw new DuplicateModelTagError(existing)
      const row = this.insert.get(name, nameKey(name), createdAt)
      if (!row) throw new Error('model tag insert returned no row')
      return this.byId(row.id)
    })()
  }

  rename(id: number, name: string): ModelTagRecord {
    return this.db.transaction(() => {
      this.byId(id)
      const clash = this.findByName(name)
      if (clash && clash.id !== id) throw new DuplicateModelTagError(clash)
      this.updateName.run(name, nameKey(name), id)
      return this.byId(id)
    })()
  }

  delete(id: number): boolean {
    return this.deleteTag.run(id).changes > 0
  }

  apply(tagId: number, { kind, identity }: ModelKey, createdAt: number): boolean {
    return this.db.transaction(() => {
      this.byId(tagId)
      if (!this.modelIsListed.get(kind, identity, kind, identity)) return false
      this.link.run(tagId, kind, identity, createdAt)
      return true
    })()
  }

  remove(tagId: number, { kind, identity }: ModelKey): boolean {
    return this.unlink.run(tagId, kind, identity).changes > 0
  }

  private findByName(name: string): ModelTagRecord | undefined {
    const row = this.selectByKey.get(nameKey(name))
    return row && recordOf(row)
  }

  /** Throws UnknownModelTagError when the tag doesn't exist. */
  private byId(id: number): ModelTagRecord {
    const row = this.selectById.get(id)
    if (!row) throw new UnknownModelTagError(id)
    return recordOf(row)
  }
}
