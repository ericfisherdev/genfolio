import type Database from 'better-sqlite3'
import type { DirectoryId, ImageFile, ImageId, RootId } from '@domain/library'
import { METADATA_INDEX_VERSION } from '@domain/metadata-record'
import type { ImageRepository, ImageVersion, StoredFileStat } from '@domain/repositories'

interface StatRow {
  id: number
  rel_path: string
  file_name: string
  size_bytes: number
  mtime_ms: number
  metadata_version: number
}

interface VersionRow {
  id: number
  size_bytes: number
  mtime_ms: number
}

type UpsertParams = [number, string, string, number, number, number, number, number, number, number]

const versionOf = (row: VersionRow): ImageVersion => ({
  id: row.id as ImageId,
  sizeBytes: row.size_bytes,
  mtimeMs: row.mtime_ms
})

export class SqliteImageRepository implements ImageRepository {
  private readonly upsert: Database.Statement<UpsertParams, VersionRow>
  private readonly countInRoot: Database.Statement<[number], { count: number }>
  private readonly statsInRoot: Database.Statement<[number], StatRow>
  private readonly versionsInDir: Database.Statement<[number], VersionRow & { file_name: string }>
  private readonly deleteUnchanged: Database.Statement<[number, number, number]>

  constructor(private readonly db: Database.Database) {
    this.upsert = db.prepare(`
      INSERT INTO images (
        directory_id, file_name, format, size_bytes, mtime_ms, width, height, created_at,
        added_at, metadata_version
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (directory_id, file_name) DO UPDATE SET
        format = excluded.format,
        size_bytes = excluded.size_bytes,
        mtime_ms = excluded.mtime_ms,
        width = excluded.width,
        height = excluded.height,
        created_at = excluded.created_at,
        metadata_version = excluded.metadata_version
      RETURNING id, size_bytes, mtime_ms
    `)
    this.countInRoot = db.prepare(`
      SELECT COUNT(*) AS count FROM images
      JOIN directories ON directories.id = images.directory_id
      WHERE directories.root_id = ?
    `)
    this.statsInRoot = db.prepare(`
      SELECT images.id, directories.rel_path, images.file_name, images.size_bytes,
        images.mtime_ms, images.metadata_version
      FROM images JOIN directories ON directories.id = images.directory_id
      WHERE directories.root_id = ?
    `)
    this.versionsInDir = db.prepare(
      'SELECT id, file_name, size_bytes, mtime_ms FROM images WHERE directory_id = ?'
    )
    this.deleteUnchanged = db.prepare(
      'DELETE FROM images WHERE id = ? AND size_bytes = ? AND mtime_ms = ?'
    )
  }

  upsertMany(images: readonly ImageFile[], addedAt: number): ImageVersion[] {
    return this.db.transaction(() =>
      images.map((image) => {
        const row = this.upsert.get(
          image.directoryId,
          image.fileName,
          image.format,
          image.sizeBytes,
          image.mtimeMs,
          image.width,
          image.height,
          image.createdAt,
          addedAt,
          METADATA_INDEX_VERSION
        )
        if (!row) throw new Error('images upsert returned no row')
        return versionOf(row)
      })
    )()
  }

  versionsInDirectory(directoryId: DirectoryId): Map<string, ImageVersion> {
    return new Map(
      this.versionsInDir.all(directoryId).map((row) => [row.file_name, versionOf(row)] as const)
    )
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
      mtimeMs: row.mtime_ms,
      metadataVersion: row.metadata_version
    }))
  }

  deleteMany(stats: readonly StoredFileStat[]): void {
    this.db.transaction(() => {
      for (const stat of stats) this.deleteUnchanged.run(stat.id, stat.sizeBytes, stat.mtimeMs)
    })()
  }
}
