import type Database from 'better-sqlite3'
import type { ImageId } from '@domain/library'
import type { MetadataRecord } from '@domain/metadata-record'
import type { MetadataRecordRepository } from '@domain/repositories'
import type { MetadataOrigin } from '@shared/metadata-kinds'

interface RecordRow {
  origin: string
  key: string
  value: string
}

export class SqliteMetadataRecordRepository implements MetadataRecordRepository {
  private readonly deleteAll: Database.Statement<[number]>
  private readonly insert: Database.Statement<[number, string, string, string]>
  private readonly select: Database.Statement<[number], RecordRow>

  constructor(private readonly db: Database.Database) {
    this.deleteAll = db.prepare('DELETE FROM metadata_raw WHERE image_id = ?')
    this.insert = db.prepare(
      'INSERT INTO metadata_raw (image_id, origin, key, value) VALUES (?, ?, ?, ?)'
    )
    this.select = db.prepare(
      'SELECT origin, key, value FROM metadata_raw WHERE image_id = ? ORDER BY id'
    )
  }

  replace(imageId: ImageId, records: readonly MetadataRecord[]): void {
    this.db.transaction(() => {
      this.deleteAll.run(imageId)
      for (const record of records)
        this.insert.run(imageId, record.origin, record.key, record.value)
    })()
  }

  list(imageId: ImageId): MetadataRecord[] {
    return this.select.all(imageId).map((row) => ({
      origin: row.origin as MetadataOrigin,
      key: row.key,
      value: row.value
    }))
  }
}
