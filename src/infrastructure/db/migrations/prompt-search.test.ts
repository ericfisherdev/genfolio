import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { MigrationRunner } from '../migration-runner'
import { migrations } from '.'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
})

function seedImage(id: number): void {
  db.prepare(
    `INSERT INTO images (id, directory_id, file_name, format, size_bytes, mtime_ms, width, height,
      created_at, added_at) VALUES (?, 1, ?, 'png', 1, 1, 1, 1, 1, 1)`
  ).run(id, `${id}.png`)
}

function seedGeneration(id: number, prompt: string, negative: string | null = null): void {
  db.prepare(
    `INSERT INTO generations (image_id, generator, origin, prompt, negative_prompt, params_json)
     VALUES (?, 'a1111', 'png-text', ?, ?, '{}')`
  ).run(id, prompt, negative)
}

const matches = (query: string): number[] =>
  db
    .prepare('SELECT rowid FROM prompt_fts WHERE prompt_fts MATCH ? ORDER BY rowid')
    .pluck()
    .all(query) as number[]

function seedLibrary(): void {
  db.exec(`
    INSERT INTO library_roots (id, path, added_at) VALUES (1, '/lib', 1);
    INSERT INTO directories (id, root_id, parent_id, rel_path) VALUES (1, 1, NULL, '');
  `)
}

describe('migration 005: prompt search', () => {
  it('indexes generations stored before the migration', () => {
    new MigrationRunner(db, migrations.slice(0, 4)).migrate()
    seedLibrary()
    seedImage(1)
    seedGeneration(1, 'a teapot on a café table', 'blurry')
    new MigrationRunner(db, migrations).migrate()
    expect(matches('teapot')).toEqual([1])
    expect(matches('negative_prompt : blurry')).toEqual([1])
  })

  it('stays in step with inserts, updates and cascading deletes', () => {
    new MigrationRunner(db, migrations).migrate()
    seedLibrary()
    seedImage(1)
    seedImage(2)
    seedGeneration(1, 'red hair')
    seedGeneration(2, 'blue sky')
    db.prepare("UPDATE generations SET prompt = 'green field' WHERE image_id = 2").run()
    expect(matches('blue')).toEqual([])
    expect(matches('green')).toEqual([2])
    db.prepare('DELETE FROM images WHERE id = 1').run()
    expect(matches('red')).toEqual([])
    expect(() =>
      db.exec("INSERT INTO prompt_fts (prompt_fts, rank) VALUES ('integrity-check', 1)")
    ).not.toThrow()
  })

  it('ignores case and diacritics', () => {
    new MigrationRunner(db, migrations).migrate()
    seedLibrary()
    seedImage(1)
    seedGeneration(1, 'Café TABLE')
    expect(matches('cafe')).toEqual([1])
    expect(matches('table')).toEqual([1])
  })
})
