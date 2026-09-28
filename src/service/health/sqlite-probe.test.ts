import { describe, expect, it } from 'vitest'
import { migratedMemoryDb } from '@infrastructure/db/testing/migrated-memory-db'
import { migrations } from '@infrastructure/db/migrations'
import { SqliteProbe } from './sqlite-probe'

describe('SqliteProbe', () => {
  it('reports the SQLite version, FTS5 support and schema version', async () => {
    const result = await new SqliteProbe(migratedMemoryDb()).probe()
    expect(result.sqlite).toMatch(/^3\.\d+\.\d+$/)
    expect(result.fts5).toBe(true)
    expect(result.schemaVersion).toBe(migrations.length)
  })

  it('leaves the library connection open', async () => {
    const db = migratedMemoryDb()
    await new SqliteProbe(db).probe()
    expect(db.open).toBe(true)
  })
})
