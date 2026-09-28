import type Database from 'better-sqlite3'
import type { ImageFile, ImageId, RootId } from '@domain/library'
import type { ImageRepository, StoredFileStat } from '@domain/repositories'

interface StatRow {
  id: number
  rel_path: string
  file_name: string
  size_bytes: number
  mtime_ms: number
}

type UpsertParams = [number, string, string, number, number, number, number, number, number]

export class SqliteImageRepository implements ImageRepository {
  private readonly upsert: Database.Statement<UpsertParams>
  private readonly countInRoot: Database.Statement<[number], { count: number }>
  private readonly statsInRoot: Database.Statement<[number], StatRow>
  private readonly deleteById: Database.Statement<[number]>

  constructor(private readonly db: Database.Database) {
    this.upsert = db.prepare(`
      INSERT INTO images
        (directory_id, file_name, format, size_bytes, mtime_ms, width, height, created_at, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (directory_id, file_name) DO UPDATE SET
        format = excluded.format,
        size_bytes = excluded.size_bytes,
        mtime_ms = excluded.mtime_ms,
        width = excluded.width,
        height = excluded.height,
        created_at = excluded.created_at
    `)
    this.countInRoot = db.prepare(`
      SELECT COUNT(*) AS count FROM images
      JOIN directories ON directories.id = images.directory_id
      WHERE directories.root_id = ?
    `)
    this.statsInRoot = db.prepare(`
      SELECT images.id, directories.rel_path, images.file_name, images.size_bytes, images.mtime_ms
      FROM images JOIN directories ON directories.id = images.directory_id
      WHERE directories.root_id = ?
    `)
    this.deleteById = db.prepare('DELETE FROM images WHERE id = ?')
  }

  upsertMany(images: readonly ImageFile[], addedAt: number): void {
    this.db.transaction(() => {
      for (const image of images) {
        this.upsert.run(
          image.directoryId,
          image.fileName,
          image.format,
          image.sizeBytes,
          image.mtimeMs,
          image.width,
          image.height,
          image.createdAt,
          addedAt
        )
      }
    })()
  }

  countByRoot(rootId: RootId): number {
    return this.countInRoot.get(rootId)?.count ?? 0
  }

  fileStatsByRoot(rootId: RootId): StoredFileStat[] {
    return this.statsInRoot.all(rootId).map((row) => ({
      id: row.id as ImageId,
      relDir: row.rel_path,
      fileName: row.file_name,
      sizeBytes: row.size_bytes,
      mtimeMs: row.mtime_ms
    }))
  }

  deleteMany(ids: readonly ImageId[]): void {
    this.db.transaction(() => {
      for (const id of ids) this.deleteById.run(id)
    })()
  }
}
