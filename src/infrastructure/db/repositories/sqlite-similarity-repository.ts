import type Database from 'better-sqlite3'
import type { ImageId } from '@domain/library'
import type { SimilarityRepository, StoredHashes } from '@domain/repositories'
import type { SimilarPair } from '@domain/similarity'

interface HashRow {
  id: bigint
  content_sha256: Uint8Array | null
  dhash: bigint
  phash: bigint
}

const hashesOf = (row: HashRow): StoredHashes => ({
  id: Number(row.id) as ImageId,
  sha256: row.content_sha256,
  dhash: row.dhash,
  phash: row.phash
})

export class SqliteSimilarityRepository implements SimilarityRepository {
  private readonly selectHashed: Database.Statement<[], HashRow>
  private readonly selectHashesOf: Database.Statement<[string], HashRow>
  private readonly deletePairsOf: Database.Statement<[string, string]>
  private readonly insertPair: Database.Statement<[number, number, number]>
  private readonly selectPairs: Database.Statement<[number], SimilarPair>
  private readonly clearGroups: Database.Statement
  private readonly setGroup: Database.Statement<[number, number]>
  private readonly selectSetting: Database.Statement<[string], { value: string }>
  private readonly upsertSetting: Database.Statement<[string, string]>

  constructor(private readonly db: Database.Database) {
    // Hashes are 64-bit patterns stored signed; read them whole as bigints.
    const hashColumns = 'SELECT id, content_sha256, dhash, phash FROM images'
    this.selectHashed = db
      .prepare<[], HashRow>(`${hashColumns} WHERE dhash IS NOT NULL AND phash IS NOT NULL`)
      .safeIntegers(true)
    this.selectHashesOf = db
      .prepare<[string], HashRow>(
        `${hashColumns} WHERE dhash IS NOT NULL AND phash IS NOT NULL
         AND id IN (SELECT value FROM json_each(?))`
      )
      .safeIntegers(true)
    this.deletePairsOf = db.prepare(`
      DELETE FROM similar_pairs
      WHERE a_id IN (SELECT value FROM json_each(?)) OR b_id IN (SELECT value FROM json_each(?))`)
    this.insertPair = db.prepare(
      'INSERT OR REPLACE INTO similar_pairs (a_id, b_id, distance) VALUES (?, ?, ?)'
    )
    this.selectPairs = db.prepare(
      'SELECT a_id AS a, b_id AS b, distance FROM similar_pairs WHERE distance <= ?'
    )
    this.clearGroups = db.prepare(
      'UPDATE images SET similar_group_id = NULL WHERE similar_group_id IS NOT NULL'
    )
    this.setGroup = db.prepare('UPDATE images SET similar_group_id = ? WHERE id = ?')
    this.selectSetting = db.prepare('SELECT value FROM app_settings WHERE key = ?')
    this.upsertSetting = db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
  }

  hashed(): StoredHashes[] {
    return this.selectHashed.all().map(hashesOf)
  }

  hashesOf(ids: readonly ImageId[]): StoredHashes[] {
    return this.selectHashesOf.all(JSON.stringify(ids)).map(hashesOf)
  }

  replacePairs(ids: readonly ImageId[], pairs: readonly SimilarPair[]): void {
    this.db.transaction(() => {
      const list = JSON.stringify(ids)
      this.deletePairsOf.run(list, list)
      for (const pair of pairs) this.insertPair.run(pair.a, pair.b, pair.distance)
    })()
  }

  pairsWithin(distance: number): SimilarPair[] {
    return this.selectPairs.all(distance)
  }

  writeGroups(groups: ReadonlyMap<number, number>): void {
    this.db.transaction(() => {
      this.clearGroups.run()
      for (const [imageId, groupId] of groups) this.setGroup.run(groupId, imageId)
    })()
  }

  setting(key: string): string | undefined {
    return this.selectSetting.get(key)?.value
  }

  saveSetting(key: string, value: string): void {
    this.upsertSetting.run(key, value)
  }
}
