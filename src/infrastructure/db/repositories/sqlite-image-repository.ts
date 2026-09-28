import type Database from 'better-sqlite3'
import type { ImageFile, RootId } from '@domain/library'
import type { ImageRepository } from '@domain/repositories'

type UpsertParams = [number, string, string, number, number, number, number, number, number]

export class SqliteImageRepository implements ImageRepository {
  private readonly upsert: Database.Statement<UpsertParams>
  private readonly countInRoot: Database.Statement<[number], { count: number }>

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
}
