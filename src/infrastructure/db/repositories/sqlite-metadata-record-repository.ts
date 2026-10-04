import type Database from 'better-sqlite3'
import type { DirectoryId, ImageId } from '@domain/library'
import type { MetadataRecord } from '@domain/metadata-record'
import type { ImageVersion, MetadataRecordRepository } from '@domain/repositories'
import type { MetadataOrigin } from '@shared/metadata-kinds'
import type { SqliteImageVersionCheck } from './sqlite-image-version-check'

interface RecordRow {
  origin: string
  key: string
  value: string
}

export class SqliteMetadataRecordRepository implements MetadataRecordRepository {
  private readonly deleteAll: Database.Statement<[number]>
  private readonly insert: Database.Statement<[number, string, string, string]>
  private readonly select: Database.Statement<[number], RecordRow>
  private readonly selectValuesInDir: Database.Statement<
    [number, string, string],
    { file_name: string; value: string }
  >

  constructor(
    private readonly db: Database.Database,
    private readonly versions: SqliteImageVersionCheck
  ) {
    this.deleteAll = db.prepare('DELETE FROM metadata_raw WHERE image_id = ?')
    this.insert = db.prepare(
      'INSERT INTO metadata_raw (image_id, origin, key, value) VALUES (?, ?, ?, ?)'
    )
    this.select = db.prepare(
      'SELECT origin, key, value FROM metadata_raw WHERE image_id = ? ORDER BY id'
    )
    this.selectValuesInDir = db.prepare(`
      SELECT images.file_name, metadata_raw.value
      FROM images JOIN metadata_raw ON metadata_raw.image_id = images.id
      WHERE images.directory_id = ? AND metadata_raw.origin = ? AND metadata_raw.key = ?`)
  }

  replace(version: ImageVersion, records: readonly MetadataRecord[]): boolean {
    return this.db.transaction(() => {
      if (!this.versions.holds(version)) return false
      this.write(version.id, records)
      return true
    })()
  }

  replaceFresh(imageId: ImageId, records: readonly MetadataRecord[]): void {
    this.write(imageId, records)
  }

  private write(imageId: ImageId, records: readonly MetadataRecord[]): void {
    this.deleteAll.run(imageId)
    for (const record of records) {
      this.insert.run(imageId, record.origin, record.key, record.value)
    }
  }

  list(imageId: ImageId): MetadataRecord[] {
    return this.select.all(imageId).map((row) => ({
      origin: row.origin as MetadataOrigin,
      key: row.key,
      value: row.value
    }))
  }

  valuesInDirectory(
    directoryId: DirectoryId,
    origin: MetadataOrigin,
    key: string
  ): Map<string, string> {
    return new Map(
      this.selectValuesInDir.all(directoryId, origin, key).map((row) => [row.file_name, row.value])
    )
  }
}
