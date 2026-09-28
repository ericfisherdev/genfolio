import type Database from 'better-sqlite3'
import type { DirectoryId } from '@domain/library'
import type { FileStamp, FooocusLogRepository } from '@domain/repositories'

interface StampRow {
  size_bytes: number
  mtime_ms: number
}

export class SqliteFooocusLogRepository implements FooocusLogRepository {
  private readonly select: Database.Statement<[number], StampRow>
  private readonly upsert: Database.Statement<[number, number, number]>

  constructor(db: Database.Database) {
    this.select = db.prepare('SELECT size_bytes, mtime_ms FROM fooocus_logs WHERE directory_id = ?')
    this.upsert = db.prepare(`
      INSERT INTO fooocus_logs (directory_id, size_bytes, mtime_ms) VALUES (?, ?, ?)
      ON CONFLICT (directory_id) DO UPDATE SET
        size_bytes = excluded.size_bytes,
        mtime_ms = excluded.mtime_ms
    `)
  }

  find(directoryId: DirectoryId): FileStamp | undefined {
    const row = this.select.get(directoryId)
    return row ? { sizeBytes: row.size_bytes, mtimeMs: row.mtime_ms } : undefined
  }

  save(directoryId: DirectoryId, stamp: FileStamp): void {
    this.upsert.run(directoryId, stamp.sizeBytes, stamp.mtimeMs)
  }
}
