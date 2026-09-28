import type Database from 'better-sqlite3'
import type { ImageVersion } from '@domain/repositories'

/** Whether an image row still has the size and mtime a caller read it with. */
export class SqliteImageVersionCheck {
  private readonly select: Database.Statement<[number, number, number], 1>

  constructor(db: Database.Database) {
    this.select = db
      .prepare('SELECT 1 FROM images WHERE id = ? AND size_bytes = ? AND mtime_ms = ?')
      .pluck() as Database.Statement<[number, number, number], 1>
  }

  /** Call inside the writing transaction so the answer still holds at write time. */
  holds(version: ImageVersion): boolean {
    return this.select.get(version.id, version.sizeBytes, version.mtimeMs) !== undefined
  }
}
