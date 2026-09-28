import type Database from 'better-sqlite3'
import type { ImageLocator, StoredImageLocation } from '@domain/image-location'
import type { ImageId } from '@domain/library'

interface LocationRow {
  root_path: string
  rel_path: string
  file_name: string
  width: number
  height: number
  mtime_ms: number
}

/** Works on a read-only connection too; main uses one for protocol lookups. */
export class SqliteImageLocator implements ImageLocator {
  private readonly byId: Database.Statement<[number], LocationRow>

  constructor(db: Database.Database) {
    this.byId = db.prepare(`
      SELECT library_roots.path AS root_path, directories.rel_path, images.file_name,
             images.width, images.height, images.mtime_ms
      FROM images
      JOIN directories ON directories.id = images.directory_id
      JOIN library_roots ON library_roots.id = directories.root_id
      WHERE images.id = ?
    `)
  }

  locate(id: ImageId): StoredImageLocation | undefined {
    const row = this.byId.get(id)
    return (
      row && {
        rootPath: row.root_path,
        relDir: row.rel_path,
        fileName: row.file_name,
        width: row.width,
        height: row.height,
        mtimeMs: row.mtime_ms
      }
    )
  }
}
