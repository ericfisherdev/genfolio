import type Database from 'better-sqlite3'
import type { ImageId } from '@domain/library'
import { nameKey } from '@shared/name-key'
import {
  DuplicateTagError,
  type TagRecord,
  type TagRepository,
  UnknownTagError
} from '@domain/repositories'

interface TagRow {
  id: number
  name: string
  image_count: number
}

const COUNTED = `
  SELECT tags.id, tags.name, COUNT(image_tags.image_id) AS image_count
  FROM tags LEFT JOIN image_tags ON image_tags.tag_id = tags.id`

const recordOf = (row: TagRow): TagRecord => ({
  id: row.id,
  name: row.name,
  imageCount: row.image_count
})

export class SqliteTagRepository implements TagRepository {
  private readonly selectAll: Database.Statement<[], TagRow>
  private readonly selectOf: Database.Statement<[number], TagRow>
  private readonly selectById: Database.Statement<[number], TagRow>
  private readonly selectByKey: Database.Statement<[string], TagRow>
  private readonly insert: Database.Statement<[string, string, number], { id: number }>
  private readonly updateName: Database.Statement<[string, string, number]>
  private readonly moveLinks: Database.Statement<[number, number]>
  private readonly deleteTag: Database.Statement<[number]>
  private readonly link: Database.Statement<[string, string]>
  private readonly unlink: Database.Statement<[string, string]>

  constructor(private readonly db: Database.Database) {
    this.selectAll = db.prepare(`${COUNTED} GROUP BY tags.id ORDER BY tags.name_key, tags.id`)
    this.selectOf = db.prepare(`${COUNTED}
      WHERE tags.id IN (SELECT tag_id FROM image_tags WHERE image_id = ?)
      GROUP BY tags.id ORDER BY tags.name_key, tags.id`)
    this.selectById = db.prepare(`${COUNTED} WHERE tags.id = ? GROUP BY tags.id`)
    this.selectByKey = db.prepare(`${COUNTED} WHERE tags.name_key = ? GROUP BY tags.id`)
    this.insert = db.prepare(
      'INSERT INTO tags (name, name_key, created_at) VALUES (?, ?, ?) RETURNING id'
    )
    this.updateName = db.prepare('UPDATE tags SET name = ?, name_key = ? WHERE id = ?')
    this.moveLinks = db.prepare(`
      INSERT OR IGNORE INTO image_tags (image_id, tag_id)
      SELECT image_id, ? FROM image_tags WHERE tag_id = ?`)
    this.deleteTag = db.prepare('DELETE FROM tags WHERE id = ?')
    // Tags and images bind as two JSON lists: one statement serves any selection.
    this.link = db.prepare(`
      INSERT OR IGNORE INTO image_tags (image_id, tag_id)
      SELECT images.value, tags.value FROM json_each(?) AS images, json_each(?) AS tags
      WHERE images.value IN (SELECT id FROM images)
        AND tags.value IN (SELECT id FROM tags)`)
    this.unlink = db.prepare(`
      DELETE FROM image_tags
      WHERE image_id IN (SELECT value FROM json_each(?))
        AND tag_id IN (SELECT value FROM json_each(?))`)
  }

  list(): TagRecord[] {
    return this.selectAll.all().map(recordOf)
  }

  tagsOf(imageId: ImageId): TagRecord[] {
    return this.selectOf.all(imageId).map(recordOf)
  }

  findByName(name: string): TagRecord | undefined {
    const row = this.selectByKey.get(nameKey(name))
    return row && recordOf(row)
  }

  create(name: string, createdAt: number): TagRecord {
    return this.db.transaction(() => {
      const existing = this.findByName(name)
      if (existing) throw new DuplicateTagError(existing)
      const row = this.insert.get(name, nameKey(name), createdAt)
      if (!row) throw new Error('tag insert returned no row')
      return this.byId(row.id)
    })()
  }

  rename(id: number, name: string): TagRecord {
    return this.db.transaction(() => {
      this.byId(id)
      const clash = this.findByName(name)
      if (clash && clash.id !== id) throw new DuplicateTagError(clash)
      this.updateName.run(name, nameKey(name), id)
      return this.byId(id)
    })()
  }

  merge(from: number, into: number): TagRecord {
    return this.db.transaction(() => {
      this.byId(from)
      this.byId(into)
      if (from !== into) {
        this.moveLinks.run(into, from)
        this.deleteTag.run(from)
      }
      return this.byId(into)
    })()
  }

  delete(id: number): boolean {
    return this.deleteTag.run(id).changes > 0
  }

  apply(tagIds: readonly number[], imageIds: readonly ImageId[]): number {
    return this.link.run(JSON.stringify(imageIds), JSON.stringify(tagIds)).changes
  }

  remove(tagIds: readonly number[], imageIds: readonly ImageId[]): number {
    return this.unlink.run(JSON.stringify(imageIds), JSON.stringify(tagIds)).changes
  }

  /** Throws UnknownTagError when the tag doesn't exist. */
  private byId(id: number): TagRecord {
    const row = this.selectById.get(id)
    if (!row) throw new UnknownTagError(id)
    return recordOf(row)
  }
}
