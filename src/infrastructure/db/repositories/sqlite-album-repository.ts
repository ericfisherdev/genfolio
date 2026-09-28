import type Database from 'better-sqlite3'
import type { ImageId } from '@domain/library'
import {
  type AlbumRecord,
  type AlbumRepository,
  DuplicateAlbumError,
  UnknownAlbumError
} from '@domain/repositories'
import { AlbumKind } from '@shared/album-kinds'
import { nameKey } from '@shared/name-key'
import { spreadPositions } from './album-positions'

interface AlbumRow {
  id: number
  name: string
  kind: string
  image_count: number
  cover_image_id: number | null
}

interface EntryRow {
  image_id: number
  position: number
}

// The cover is the chosen image while it is still in the album, else the first one.
const SELECT_ALBUMS = `
  SELECT albums.id, albums.name, albums.kind,
    (SELECT COUNT(*) FROM album_images WHERE album_id = albums.id) AS image_count,
    COALESCE(
      (SELECT image_id FROM album_images
        WHERE album_id = albums.id AND image_id = albums.cover_image_id),
      (SELECT image_id FROM album_images
        WHERE album_id = albums.id ORDER BY position, image_id LIMIT 1)
    ) AS cover_image_id
  FROM albums`

const recordOf = (row: AlbumRow): AlbumRecord => ({
  id: row.id,
  name: row.name,
  kind: row.kind as AlbumKind,
  imageCount: row.image_count,
  coverImageId: row.cover_image_id as ImageId | null
})

export class SqliteAlbumRepository implements AlbumRepository {
  private readonly selectAll: Database.Statement<[], AlbumRow>
  private readonly selectById: Database.Statement<[number], AlbumRow>
  private readonly selectByKey: Database.Statement<[string], AlbumRow>
  private readonly insert: Database.Statement<[string, string, string, number], { id: number }>
  private readonly updateName: Database.Statement<[string, string, number]>
  private readonly deleteAlbum: Database.Statement<[number]>
  private readonly lastPosition: Database.Statement<[number], { last: number | null }>
  private readonly append: Database.Statement<[number, number, string]>
  private readonly unlink: Database.Statement<[number, string]>
  private readonly entries: Database.Statement<[number], EntryRow>
  private readonly place: Database.Statement<[number, number, number]>
  private readonly updateCover: Database.Statement<[{ image: number | null; album: number }]>

  constructor(private readonly db: Database.Database) {
    this.selectAll = db.prepare(`${SELECT_ALBUMS} ORDER BY albums.name_key, albums.id`)
    this.selectById = db.prepare(`${SELECT_ALBUMS} WHERE albums.id = ?`)
    this.selectByKey = db.prepare(`${SELECT_ALBUMS} WHERE albums.name_key = ?`)
    this.insert = db.prepare(
      'INSERT INTO albums (name, name_key, kind, created_at) VALUES (?, ?, ?, ?) RETURNING id'
    )
    this.updateName = db.prepare('UPDATE albums SET name = ?, name_key = ? WHERE id = ?')
    this.deleteAlbum = db.prepare('DELETE FROM albums WHERE id = ?')
    this.lastPosition = db.prepare(
      'SELECT MAX(position) AS last FROM album_images WHERE album_id = ?'
    )
    // Images bind as one JSON list; `key` is each id's index in it, so input order is kept.
    this.append = db.prepare(`
      INSERT OR IGNORE INTO album_images (album_id, image_id, position)
      SELECT ?, value, ? + key + 1 FROM json_each(?)
      WHERE value IN (SELECT id FROM images)`)
    this.unlink = db.prepare(`
      DELETE FROM album_images
      WHERE album_id = ? AND image_id IN (SELECT value FROM json_each(?))`)
    this.entries = db.prepare(
      'SELECT image_id, position FROM album_images WHERE album_id = ? ORDER BY position, image_id'
    )
    this.place = db.prepare(
      'UPDATE album_images SET position = ? WHERE album_id = ? AND image_id = ?'
    )
    this.updateCover = db.prepare(`
      UPDATE albums SET cover_image_id = :image
      WHERE id = :album AND (:image IS NULL
        OR EXISTS (SELECT 1 FROM album_images WHERE album_id = :album AND image_id = :image))`)
  }

  list(): AlbumRecord[] {
    return this.selectAll.all().map(recordOf)
  }

  find(id: number): AlbumRecord {
    const row = this.selectById.get(id)
    if (!row) throw new UnknownAlbumError(id)
    return recordOf(row)
  }

  create(name: string, createdAt: number): AlbumRecord {
    return this.db.transaction(() => {
      const existing = this.selectByKey.get(nameKey(name))
      if (existing) throw new DuplicateAlbumError(recordOf(existing))
      const row = this.insert.get(name, nameKey(name), AlbumKind.Manual, createdAt)
      if (!row) throw new Error('album insert returned no row')
      return this.find(row.id)
    })()
  }

  rename(id: number, name: string): AlbumRecord {
    return this.db.transaction(() => {
      this.find(id)
      const clash = this.selectByKey.get(nameKey(name))
      if (clash && clash.id !== id) throw new DuplicateAlbumError(recordOf(clash))
      this.updateName.run(name, nameKey(name), id)
      return this.find(id)
    })()
  }

  delete(id: number): boolean {
    return this.deleteAlbum.run(id).changes > 0
  }

  add(albumId: number, imageIds: readonly ImageId[]): number {
    return this.db.transaction(() => {
      if (!this.isManual(albumId)) return 0
      const last = this.lastPosition.get(albumId)?.last ?? 0
      return this.append.run(albumId, Math.ceil(last), JSON.stringify(imageIds)).changes
    })()
  }

  remove(albumId: number, imageIds: readonly ImageId[]): number {
    return this.unlink.run(albumId, JSON.stringify(imageIds)).changes
  }

  move(albumId: number, imageIds: readonly ImageId[], beforeId: ImageId | null): number {
    return this.db.transaction(() => {
      if (!this.isManual(albumId)) return 0
      const order = this.entries.all(albumId)
      const moving = new Set<number>(imageIds)
      const moved = order.filter((entry) => moving.has(entry.image_id))
      if (moved.length === 0) return 0
      const staying = order.filter((entry) => !moving.has(entry.image_id))
      const at = insertionIndex(order, staying, moving, beforeId)
      const positions = spreadPositions(
        staying[at - 1]?.position,
        staying[at]?.position,
        moved.length
      )
      if (positions) {
        moved.forEach((entry, index) =>
          this.place.run(positions[index] ?? 0, albumId, entry.image_id)
        )
      } else {
        const renumbered = [...staying.slice(0, at), ...moved, ...staying.slice(at)]
        renumbered.forEach((entry, index) => this.place.run(index + 1, albumId, entry.image_id))
      }
      return moved.length
    })()
  }

  setCover(albumId: number, imageId: ImageId | null): AlbumRecord {
    return this.db.transaction(() => {
      this.updateCover.run({ image: imageId, album: albumId })
      return this.find(albumId)
    })()
  }

  private isManual(albumId: number): boolean {
    return this.selectById.get(albumId)?.kind === AlbumKind.Manual
  }
}

/**
 * Where the moved images go among the staying ones: before `beforeId`, or, when it is one of
 * the moved images, before the first staying image after it; at the end when there is none.
 */
function insertionIndex(
  order: readonly EntryRow[],
  staying: readonly EntryRow[],
  moving: ReadonlySet<number>,
  beforeId: number | null
): number {
  if (beforeId === null) return staying.length
  const from = order.findIndex((entry) => entry.image_id === beforeId)
  if (from < 0) return staying.length
  const anchor = order.slice(from).find((entry) => !moving.has(entry.image_id))
  return anchor ? staying.indexOf(anchor) : staying.length
}
