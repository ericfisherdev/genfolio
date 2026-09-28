import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { nameKey } from '@domain/name-key'
import { storedSearchFiltersSchema } from '@shared/search'
import { MigrationRunner } from '../migration-runner'
import { migrations } from '.'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
})

function seedImages(count: number): void {
  db.exec(`
    INSERT INTO library_roots (id, path, added_at) VALUES (1, '/lib', 1);
    INSERT INTO directories (id, root_id, parent_id, rel_path) VALUES (1, 1, NULL, '');
  `)
  const insert = db.prepare(
    `INSERT INTO images (id, directory_id, file_name, format, size_bytes, mtime_ms, width, height,
      created_at, added_at) VALUES (?, 1, ?, 'png', 1, 1, 1, 1, 1, 1)`
  )
  for (let id = 1; id <= count; id++) insert.run(id, `${id}.png`)
}

const count = (table: string): number =>
  db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number

const tag = (name: string, key = name.toLowerCase()): void => {
  db.prepare('INSERT INTO tags (name, name_key, created_at) VALUES (?, ?, 1)').run(name, key)
}
const album = (name: string, kind: string, filters: string | null = null): void => {
  db.prepare(
    'INSERT INTO albums (name, name_key, kind, filters_json, created_at) VALUES (?, ?, ?, ?, 1)'
  ).run(name, name.toLowerCase(), kind, filters)
}

describe('migration 006: user data', () => {
  it('gives images stored before it no favourite and no rating', () => {
    new MigrationRunner(db, migrations.slice(0, 5)).migrate()
    seedImages(2)
    new MigrationRunner(db, migrations).migrate()
    expect(db.prepare('SELECT is_favorite, rating FROM images').all()).toEqual([
      { is_favorite: 0, rating: 0 },
      { is_favorite: 0, rating: 0 }
    ])
  })

  it('rejects out-of-range ratings and favourites', () => {
    new MigrationRunner(db, migrations).migrate()
    seedImages(1)
    expect(() => db.exec('UPDATE images SET rating = 6')).toThrow(/CHECK/)
    expect(() => db.exec('UPDATE images SET is_favorite = 2')).toThrow(/CHECK/)
  })

  it('keeps names non-blank and unique on their folded key', () => {
    new MigrationRunner(db, migrations).migrate()
    tag('Élan', 'élan')
    expect(() => tag('ÉLAN', 'élan')).toThrow(/UNIQUE/)
    expect(() => tag('  ', ' ')).toThrow(/CHECK/)
    // A tab or no-break space passes SQLite's space-only trim, but its folded key is empty.
    expect(() => tag('\t', nameKey('\t'))).toThrow(/CHECK/)
    expect(() => tag('\u00a0', nameKey('\u00a0'))).toThrow(/CHECK/)
    album('Best', 'manual')
    expect(() => album('BEST', 'manual')).toThrow(/UNIQUE/)
  })

  it('pairs album kinds with filters and accepts only small, valid JSON', () => {
    new MigrationRunner(db, migrations).migrate()
    expect(() => album('a', 'smart')).toThrow(/CHECK/)
    expect(() => album('b', 'manual', '{}')).toThrow(/CHECK/)
    expect(() => album('c', 'smart', 'not json')).toThrow(/CHECK/)
    expect(() => album('d', 'smart', JSON.stringify({ seed: 'x'.repeat(70_000) }))).toThrow(/CHECK/)
    album('e', 'smart', JSON.stringify({ seed: '42' }))
    expect(() => album('f', 'shared', null)).toThrow(/CHECK/)
  })

  it('bounds slideshow presets and keeps their names unique', () => {
    new MigrationRunner(db, migrations).migrate()
    const preset = db.prepare(
      `INSERT INTO slideshow_presets (name, name_key, interval_ms, shuffle, loop, show_prompt)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    preset.run('ok', 'ok', 2000, 0, 1, 0)
    expect(() => preset.run('fast', 'fast', 1999, 0, 0, 0)).toThrow(/CHECK/)
    expect(() => preset.run('slow', 'slow', 60_001, 0, 0, 0)).toThrow(/CHECK/)
    expect(() => preset.run('shuffle', 'shuffle', 5000, 2, 0, 0)).toThrow(/CHECK/)
    expect(() => preset.run('loop', 'loop', 5000, 0, 2, 0)).toThrow(/CHECK/)
    expect(() => preset.run('prompt', 'prompt', 5000, 0, 0, 2)).toThrow(/CHECK/)
    expect(() => preset.run('OK', 'ok', 5000, 0, 0, 0)).toThrow(/UNIQUE/)
  })

  it('cascades from images, tags and albums, and clears a deleted cover', () => {
    new MigrationRunner(db, migrations).migrate()
    seedImages(2)
    tag('red')
    tag('blue')
    db.exec(`
      INSERT INTO image_tags VALUES (1, 1), (1, 2), (2, 1);
      INSERT INTO albums (id, name, name_key, kind, cover_image_id, created_at)
        VALUES (1, 'best', 'best', 'manual', 1, 1);
      INSERT INTO album_images VALUES (1, 1, 1.0), (1, 2, 2.0);
    `)
    db.exec('DELETE FROM images WHERE id = 1')
    expect([count('image_tags'), count('album_images')]).toEqual([1, 1])
    expect(db.prepare('SELECT cover_image_id FROM albums').pluck().get()).toBeNull()
    db.exec('DELETE FROM tags WHERE id = 1')
    expect(count('image_tags')).toBe(0)
    db.exec('DELETE FROM albums')
    expect(count('album_images')).toBe(0)
  })

  it('reads the favourites view in order from its partial index', () => {
    new MigrationRunner(db, migrations).migrate()
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM images WHERE is_favorite = 1
         ORDER BY created_at DESC, id DESC`
      )
      .all()
      .map((row) => (row as { detail: string }).detail)
      .join(' | ')
    expect(plan).toContain('images_favorite')
    expect(plan).not.toContain('TEMP B-TREE')
  })
})

describe('storedSearchFiltersSchema', () => {
  it('names models by identity and the prompt by text, never by id', () => {
    expect(
      storedSearchFiltersSchema.safeParse({
        checkpoints: [{ identity: 'juggernaut' }],
        loras: { models: [{ identity: 'detail' }], mode: 'all', minWeight: 0.5 },
        samePrompt: 'a cat'
      }).success
    ).toBe(true)
    expect(storedSearchFiltersSchema.safeParse({ checkpointIds: [2] }).success).toBe(false)
    expect(storedSearchFiltersSchema.safeParse({ samePromptAs: 7 }).success).toBe(false)
    expect(storedSearchFiltersSchema.safeParse({ checkpoints: [{ id: 2 }] }).success).toBe(false)
  })
})
