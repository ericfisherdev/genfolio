import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { SqliteProbe } from './sqlite-probe'

describe('SqliteProbe', () => {
  it('reports the SQLite version and FTS5 support', async () => {
    const result = await new SqliteProbe(() => new Database(':memory:')).probe()
    expect(result.sqlite).toMatch(/^3\.\d+\.\d+$/)
    expect(result.fts5).toBe(true)
  })

  it('closes the scratch database', async () => {
    const db = new Database(':memory:')
    await new SqliteProbe(() => db).probe()
    expect(db.open).toBe(false)
  })
})
