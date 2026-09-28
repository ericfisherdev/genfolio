import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DirectoryId, ImageFile } from '@domain/library'
import { ImageFormat } from '@shared/image-format'
import { SqliteImageRepository } from '../repositories/sqlite-image-repository'
import { MigrationRunner } from '../migration-runner'
import { migrations } from '.'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
})

function seed(): void {
  db.exec(`
    INSERT INTO library_roots (id, path, added_at) VALUES (1, '/lib', 1);
    INSERT INTO directories (id, root_id, parent_id, rel_path) VALUES (1, 1, NULL, '');
  `)
  const insert = db.prepare(
    `INSERT INTO images (id, directory_id, file_name, format, size_bytes, mtime_ms, width, height,
      created_at, added_at) VALUES (?, 1, ?, 'png', 1, 1, 1, 1, 1, 1)`
  )
  for (let id = 1; id <= 3; id++) insert.run(id, `${id}.png`)
}

const hashed = (): void => {
  db.exec(`UPDATE images SET content_sha256 = zeroblob(32), dhash = 1, phash = 2,
    hash_version = 1, similar_group_id = 1`)
  db.exec('INSERT INTO similar_pairs (a_id, b_id, distance) VALUES (1, 2, 3), (2, 3, 4)')
}

const pairs = (): unknown[] => db.prepare('SELECT a_id, b_id FROM similar_pairs').all()

describe('migration 007: similarity', () => {
  it('starts images stored before it unhashed and ungrouped', () => {
    new MigrationRunner(db, migrations.slice(0, 6)).migrate()
    seed()
    new MigrationRunner(db, migrations).migrate()
    expect(
      db.prepare('SELECT DISTINCT hash_version, dhash, similar_group_id FROM images').all()
    ).toEqual([{ hash_version: 0, dhash: null, similar_group_id: null }])
  })

  it('keeps pairs ordered and cascades them with their images', () => {
    new MigrationRunner(db, migrations).migrate()
    seed()
    hashed()
    expect(() =>
      db.exec('INSERT INTO similar_pairs (a_id, b_id, distance) VALUES (3, 1, 0)')
    ).toThrow(/CHECK/)
    expect(() => db.exec('UPDATE images SET content_sha256 = zeroblob(8)')).toThrow(/CHECK/)
    db.exec('DELETE FROM images WHERE id = 2')
    expect(pairs()).toEqual([])
  })

  it('clears the hashes and pairs of a file that changed on disk, and keeps an unchanged one', () => {
    new MigrationRunner(db, migrations).migrate()
    seed()
    hashed()
    const images = new SqliteImageRepository(db)
    const file = (name: string, mtimeMs: number): ImageFile => ({
      directoryId: 1 as DirectoryId,
      fileName: name,
      format: ImageFormat.Png,
      sizeBytes: 1,
      mtimeMs,
      width: 1,
      height: 1,
      createdAt: 1
    })
    images.upsertMany([file('1.png', 1), file('3.png', 2)], 1)
    expect(
      db.prepare('SELECT id, hash_version, dhash, similar_group_id FROM images').all()
    ).toEqual([
      { id: 1, hash_version: 1, dhash: 1, similar_group_id: 1 },
      { id: 2, hash_version: 1, dhash: 1, similar_group_id: 1 },
      { id: 3, hash_version: 0, dhash: null, similar_group_id: null }
    ])
    expect(pairs()).toEqual([{ a_id: 1, b_id: 2 }])
  })
})
