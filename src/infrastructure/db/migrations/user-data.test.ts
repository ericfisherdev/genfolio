import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
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

  it('rejects out-of-range ratings, favourites and album kinds', () => {
    new MigrationRunner(db, migrations).migrate()
    seedImages(1)
    expect(() => db.exec('UPDATE images SET rating = 6')).toThrow(/CHECK/)
    expect(() => db.exec('UPDATE images SET is_favorite = 2')).toThrow(/CHECK/)
    expect(() =>
      db.exec("INSERT INTO albums (name, kind, created_at) VALUES ('a', 'smart', 1)")
    ).toThrow(/CHECK/)
    expect(() =>
      db.exec(
        "INSERT INTO albums (name, kind, filters_json, created_at) VALUES ('a', 'manual', '{}', 1)"
      )
    ).toThrow(/CHECK/)
    expect(() =>
      db.exec("INSERT INTO tags (name, created_at) VALUES ('Red', 1), ('red', 1)")
    ).toThrow(/UNIQUE/)
  })

  it('cascades from images, tags and albums, and clears a deleted cover', () => {
    new MigrationRunner(db, migrations).migrate()
    seedImages(2)
    db.exec(`
      INSERT INTO tags (id, name, created_at) VALUES (1, 'red', 1), (2, 'blue', 1);
      INSERT INTO image_tags VALUES (1, 1), (1, 2), (2, 1);
      INSERT INTO albums (id, name, kind, cover_image_id, created_at) VALUES (1, 'best', 'manual', 1, 1);
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
})
