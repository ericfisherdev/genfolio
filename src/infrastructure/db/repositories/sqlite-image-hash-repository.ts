import type Database from 'better-sqlite3'
import type { ImageHashes } from '@domain/image-hashes'
import type { ImageId } from '@domain/library'
import type { ImageHashRepository, ImageVersion } from '@domain/repositories'

interface VersionRow {
  id: number
  size_bytes: number
  mtime_ms: number
}

/** Hashes are 64-bit patterns; SQLite stores them as signed integers. */
const signed = (hash: bigint): bigint => BigInt.asIntN(64, hash)

export class SqliteImageHashRepository implements ImageHashRepository {
  private readonly countPending: Database.Statement<[number], { count: number }>
  private readonly selectPending: Database.Statement<[number, number, number], VersionRow>
  private readonly update: Database.Statement<
    [Uint8Array | null, bigint | null, bigint | null, number, number, number, number]
  >

  constructor(db: Database.Database) {
    this.countPending = db.prepare('SELECT COUNT(*) AS count FROM images WHERE hash_version < ?')
    this.selectPending = db.prepare(`
      SELECT id, size_bytes, mtime_ms FROM images
      WHERE hash_version < ? AND id > ? ORDER BY id LIMIT ?`)
    this.update = db.prepare(`
      UPDATE images SET content_sha256 = ?, dhash = ?, phash = ?, hash_version = ?
      WHERE id = ? AND size_bytes = ? AND mtime_ms = ?`)
  }

  pendingCount(hashVersion: number): number {
    return this.countPending.get(hashVersion)?.count ?? 0
  }

  pending(hashVersion: number, afterId: number, limit: number): ImageVersion[] {
    return this.selectPending.all(hashVersion, afterId, limit).map((row) => ({
      id: row.id as ImageId,
      sizeBytes: row.size_bytes,
      mtimeMs: row.mtime_ms
    }))
  }

  store(version: ImageVersion, hashes: ImageHashes | null, hashVersion: number): boolean {
    return (
      this.update.run(
        hashes ? hashes.sha256 : null,
        hashes ? signed(hashes.dhash) : null,
        hashes ? signed(hashes.phash) : null,
        hashVersion,
        version.id,
        version.sizeBytes,
        version.mtimeMs
      ).changes > 0
    )
  }
}
