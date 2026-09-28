import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DirectoryId, ImageFile, RootId } from '@domain/library'
import { DuplicateRootError } from '@domain/repositories'
import { ImageFormat } from '@shared/image-format'
import { migratedMemoryDb } from '../testing/migrated-memory-db'
import { ancestorPaths, SqliteDirectoryRepository } from './sqlite-directory-repository'
import { SqliteImageRepository } from './sqlite-image-repository'
import { SqliteLibraryRootRepository } from './sqlite-library-root-repository'

let db: Database.Database
let roots: SqliteLibraryRootRepository
let directories: SqliteDirectoryRepository
let images: SqliteImageRepository

beforeEach(() => {
  db = migratedMemoryDb()
  roots = new SqliteLibraryRootRepository(db)
  directories = new SqliteDirectoryRepository(db)
  images = new SqliteImageRepository(db)
})

function imageIn(directoryId: DirectoryId, fileName: string, sizeBytes = 100): ImageFile {
  return {
    directoryId,
    fileName,
    format: ImageFormat.Png,
    sizeBytes,
    mtimeMs: 1_700_000_000_000,
    width: 832,
    height: 1216,
    createdAt: 1_700_000_000_000
  }
}

describe('SqliteLibraryRootRepository', () => {
  it('finds a root by id', () => {
    const root = roots.add('/a', 5)
    expect(roots.findById(root.id)).toEqual(root)
    expect(roots.findById(999 as RootId)).toBeUndefined()
  })

  it('adds and lists roots sorted by path', () => {
    roots.add('/b', 1)
    roots.add('/a', 2)
    expect(roots.list().map((root) => root.path)).toEqual(['/a', '/b'])
  })

  it('rejects a duplicate path', () => {
    roots.add('/a', 1)
    expect(() => roots.add('/a', 2)).toThrow(DuplicateRootError)
  })

  it('removing a root cascades to its directories and images', () => {
    const root = roots.add('/a', 1)
    const other = roots.add('/b', 1)
    images.upsertMany([imageIn(directories.ensure(root.id, 'x/y'), '1.png')], 1)
    images.upsertMany([imageIn(directories.ensure(other.id, ''), '2.png')], 1)

    expect(roots.remove(root.id)).toBe(true)
    expect(directories.listByRoot(root.id)).toEqual([])
    expect(images.countByRoot(root.id)).toBe(0)
    expect(images.countByRoot(other.id)).toBe(1)
    expect(roots.remove(root.id)).toBe(false)
  })
})

describe('SqliteDirectoryRepository', () => {
  it('lists ancestor paths root first', () => {
    expect(ancestorPaths('a/b/c')).toEqual(['', 'a', 'a/b', 'a/b/c'])
    expect(ancestorPaths('')).toEqual([''])
  })

  it('creates missing ancestors with parent links', () => {
    const root = roots.add('/a', 1)
    const leaf = directories.ensure(root.id, '2026/09/27')
    const byPath = new Map(directories.listByRoot(root.id).map((d) => [d.relPath, d]))

    expect([...byPath.keys()]).toEqual(['', '2026', '2026/09', '2026/09/27'])
    expect(byPath.get('')?.parentId).toBeNull()
    expect(byPath.get('2026/09')?.parentId).toBe(byPath.get('2026')?.id)
    expect(byPath.get('2026/09/27')?.id).toBe(leaf)
  })

  it('prunes directories with no images anywhere below them, keeping the root', () => {
    const root = roots.add('/a', 1)
    images.upsertMany([imageIn(directories.ensure(root.id, 'kept/deep'), '1.png')], 1)
    directories.ensure(root.id, 'empty/deeper/deepest')
    directories.ensure(root.id, 'kept/empty-sibling')

    expect(directories.pruneEmpty(root.id)).toBe(4)
    expect(directories.listByRoot(root.id).map((d) => d.relPath)).toEqual(['', 'kept', 'kept/deep'])
  })

  it('moves a whole root under a prefix of another root, keeping ids and images', () => {
    const outer = roots.add('/lib', 1)
    const inner = roots.add('/lib/2026/09', 1)
    const deep = directories.ensure(inner.id, '27')
    images.upsertMany([imageIn(deep, 'a.png')], 1)
    const innerRootDir = directories.listByRoot(inner.id).find((d) => d.relPath === '')

    directories.moveRoot(inner.id, outer.id, '2026/09')

    const byPath = new Map(directories.listByRoot(outer.id).map((d) => [d.relPath, d]))
    expect([...byPath.keys()]).toEqual(['', '2026', '2026/09', '2026/09/27'])
    expect(byPath.get('2026/09')?.id).toBe(innerRootDir?.id)
    expect(byPath.get('2026/09')?.parentId).toBe(byPath.get('2026')?.id)
    expect(byPath.get('2026/09/27')?.id).toBe(deep)
    expect(images.countByRoot(outer.id)).toBe(1)
    expect(directories.listByRoot(inner.id)).toEqual([])
  })

  it('returns the same id when called again', () => {
    const root = roots.add('/a', 1)
    expect(directories.ensure(root.id, 'x')).toBe(directories.ensure(root.id, 'x'))
    expect(directories.listByRoot(root.id)).toHaveLength(2)
  })
})

describe('SqliteImageRepository', () => {
  it('updates file facts on conflict but keeps the first addedAt', () => {
    const root = roots.add('/a', 1)
    const dir = directories.ensure(root.id, '')
    images.upsertMany([imageIn(dir, 'a.png', 100)], 111)
    images.upsertMany([imageIn(dir, 'a.png', 200)], 222)

    const row = db.prepare('SELECT size_bytes, added_at FROM images').get()
    expect(row).toEqual({ size_bytes: 200, added_at: 111 })
    expect(images.countByRoot(root.id)).toBe(1)
  })

  it('lists stored file stats per root and deletes by id', () => {
    const root = roots.add('/a', 1)
    const dir = directories.ensure(root.id, 'x')
    images.upsertMany([imageIn(dir, 'a.png', 1), imageIn(dir, 'b.png', 2)], 1)
    const stats = images
      .fileStatsByRoot(root.id)
      .sort((a, b) => a.fileName.localeCompare(b.fileName))
    expect(stats.map((s) => [s.relDir, s.fileName, s.sizeBytes])).toEqual([
      ['x', 'a.png', 1],
      ['x', 'b.png', 2]
    ])

    images.deleteMany([stats[0]!])
    expect(images.fileStatsByRoot(root.id).map((s) => s.fileName)).toEqual(['b.png'])
  })

  it('keeps a row whose size or mtime changed since the snapshot', () => {
    const root = roots.add('/a', 1)
    const dir = directories.ensure(root.id, '')
    images.upsertMany([imageIn(dir, 'a.png', 1)], 1)
    const [snapshot] = images.fileStatsByRoot(root.id)
    images.upsertMany([imageIn(dir, 'a.png', 999)], 1)

    images.deleteMany([snapshot!])
    expect(images.countByRoot(root.id)).toBe(1)
  })

  it('rejects a fractional mtime instead of storing a REAL (STRICT table)', () => {
    const root = roots.add('/a', 1)
    const dir = directories.ensure(root.id, '')
    expect(() => images.upsertMany([{ ...imageIn(dir, 'a.png'), mtimeMs: 1.5 }], 1)).toThrow()
  })

  it('upserts 10k images in one batch within a second', () => {
    const root = roots.add('/a', 1)
    const dir = directories.ensure(root.id as RootId, '')
    const batch = Array.from({ length: 10_000 }, (_, i) => imageIn(dir, `${i}.png`))
    const started = performance.now()
    images.upsertMany(batch, 1)
    expect(performance.now() - started).toBeLessThan(1_000)
    expect(images.countByRoot(root.id)).toBe(10_000)
  })
})
