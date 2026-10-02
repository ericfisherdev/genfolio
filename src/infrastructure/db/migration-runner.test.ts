import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { MigrationError, MigrationRunner } from './migration-runner'
import { migrations } from './migrations'
import type { Migration } from './migrations/migration'

const tableNames = (db: Database.Database): string[] =>
  db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name)

const version = (db: Database.Database): unknown => db.pragma('user_version', { simple: true })

// Includes the FTS5 virtual table and its shadow tables (migration 005).
const LATEST_TABLES = [
  'album_images',
  'albums',
  'app_settings',
  'directories',
  'fooocus_logs',
  'generation_loras',
  'generations',
  'image_tags',
  'images',
  'library_roots',
  'metadata_raw',
  'model_hashes',
  'model_info',
  'models',
  'prompt_fts',
  'prompt_fts_config',
  'prompt_fts_data',
  'prompt_fts_docsize',
  'prompt_fts_idx',
  'similar_pairs',
  'slideshow_presets',
  'tags'
]

describe('MigrationRunner', () => {
  it('migrates a fresh database to the latest version', () => {
    const db = new Database(':memory:')
    expect(new MigrationRunner(db, migrations).migrate()).toBe(migrations.length)
    expect(version(db)).toBe(migrations.length)
    expect(tableNames(db)).toEqual(LATEST_TABLES)
  })

  it('is a no-op when already current', () => {
    const db = new Database(':memory:')
    new MigrationRunner(db, migrations).migrate()
    expect(() => new MigrationRunner(db, migrations).migrate()).not.toThrow()
    expect(version(db)).toBe(migrations.length)
  })

  it('refuses a database written by a newer app', () => {
    const db = new Database(':memory:')
    db.pragma(`user_version = ${migrations.length + 1}`)
    expect(() => new MigrationRunner(db, migrations).migrate()).toThrow(MigrationError)
  })

  it('refuses a migration list with a gap', () => {
    const gapped: Migration[] = [{ version: 2, name: 'skipped one', sql: 'SELECT 1' }]
    expect(() => new MigrationRunner(new Database(':memory:'), gapped).migrate()).toThrow(
      /expected 1/
    )
  })

  it('skips a migration another connection applied after the version was first read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'genfolio-migrate-'))
    try {
      const path = join(dir, 'genfolio.db')
      const first = new Database(path)
      new MigrationRunner(first, migrations).migrate()

      const second = new Database(path)
      const realPragma = second.pragma.bind(second)
      vi.spyOn(second, 'pragma')
        .mockImplementationOnce(() => 0)
        .mockImplementation((source, options) => realPragma(source, options))

      expect(() => new MigrationRunner(second, migrations).migrate()).not.toThrow()
      expect(version(second)).toBe(migrations.length)
      expect(tableNames(second)).toEqual(LATEST_TABLES)
      first.close()
      second.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rolls back a failing migration completely', () => {
    const db = new Database(':memory:')
    const broken: Migration[] = [
      {
        version: 1,
        name: 'half done',
        sql: 'CREATE TABLE partial (id INTEGER); SELECT nope FROM x;'
      }
    ]
    expect(() => new MigrationRunner(db, broken).migrate()).toThrow()
    expect(version(db)).toBe(0)
    expect(tableNames(db)).toEqual([])
  })
})
