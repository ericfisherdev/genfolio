import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RootId } from '@domain/library'
import { SqliteDirectoryRepository } from '@infrastructure/db/repositories/sqlite-directory-repository'
import { SqliteImageRepository } from '@infrastructure/db/repositories/sqlite-image-repository'
import { SqliteLibraryRootRepository } from '@infrastructure/db/repositories/sqlite-library-root-repository'
import { migratedMemoryDb } from '@infrastructure/db/testing/migrated-memory-db'
import { NodeDirectoryResolver } from '@infrastructure/fs/node-directory-resolver'
import { ImageFormat } from '@shared/image-format'
import { AddRootOutcome } from '@shared/library'
import { LibraryRoots, UnknownRootError, isInside, type DirectoryResolver } from './library-roots'
import { ScanCoordinator, type RootScanner } from './scan-coordinator'

let dir: string
let db: Database.Database
let started: RootId[]
let roots: LibraryRoots
let blockScans: boolean

const idleReport = { added: 0, updated: 0, unchanged: 0, removed: 0, failed: 0 }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genfolio-roots-'))
  db = migratedMemoryDb()
  started = []
  blockScans = false
  roots = makeRoots(new NodeDirectoryResolver())
})

function makeRoots(resolver: DirectoryResolver): LibraryRoots {
  const scanner: RootScanner = {
    run: (root, signal) => {
      started.push(root.id)
      if (!blockScans) return Promise.resolve(idleReport)
      return new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason))
      )
    }
  }
  return new LibraryRoots({
    roots: new SqliteLibraryRootRepository(db),
    directories: new SqliteDirectoryRepository(db),
    images: new SqliteImageRepository(db),
    scans: new ScanCoordinator(scanner, () => undefined),
    resolver,
    transact: (work) => db.transaction(work)(),
    now: () => 42
  })
}

/** Resolves instantly, so concurrent adds reach their decisions in the same turn. */
const instantResolver: DirectoryResolver = { realDirectory: async (path) => path }

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** Lets the fake scans' completion handlers run. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function folder(relPath: string): string {
  const path = join(dir, relPath)
  mkdirSync(path, { recursive: true })
  return path
}

describe('isInside', () => {
  it('is strict and segment-aware', () => {
    expect(isInside('/lib/a', '/lib')).toBe(true)
    expect(isInside('/lib', '/lib')).toBe(false)
    expect(isInside('/library', '/lib')).toBe(false)
    expect(isInside('/lib', '/lib/a')).toBe(false)
    expect(isInside('/lib/..hidden', '/lib')).toBe(true)
    expect(isInside('/lib/../x', '/lib')).toBe(false)
  })
})

describe('LibraryRoots', () => {
  it('adds a folder, starts its scan and lists it', async () => {
    const path = folder('outputs')
    const result = await roots.add(path)

    expect(result).toMatchObject({ outcome: AddRootOutcome.Added, absorbedRoots: 0 })
    expect(started).toHaveLength(1)
    await settle()
    expect(roots.list()).toEqual([
      { id: started[0], path, addedAt: 42, imageCount: 0, scanning: false }
    ])
  })

  it('stores the resolved path when added through a symlink', async () => {
    const real = folder('real')
    symlinkSync(real, join(dir, 'alias'))
    await roots.add(join(dir, 'alias'))
    expect(roots.list()[0]?.path).toBe(real)
  })

  it('rejects a missing path and a file as not a directory', async () => {
    writeFileSync(join(dir, 'file.png'), 'x')
    for (const path of [join(dir, 'missing'), join(dir, 'file.png')]) {
      expect(await roots.add(path)).toEqual({ outcome: AddRootOutcome.NotADirectory, path })
    }
  })

  it('rejects the same folder twice and a folder inside an existing root', async () => {
    const outer = folder('outputs')
    await roots.add(outer)
    expect(await roots.add(outer)).toEqual({ outcome: AddRootOutcome.AlreadyAdded, path: outer })
    expect(await roots.add(folder('outputs/2026-09-27'))).toEqual({
      outcome: AddRootOutcome.InsideExistingRoot,
      path: outer
    })
  })

  it('merges existing roots inside a newly added parent, keeping their images', async () => {
    const inner = folder('outputs/2026-09-27')
    await roots.add(inner)
    const innerId = roots.list()[0]?.id as RootId
    const directories = new SqliteDirectoryRepository(db)
    new SqliteImageRepository(db).upsertMany(
      [
        {
          directoryId: directories.ensure(innerId, ''),
          fileName: 'a.png',
          format: ImageFormat.Png,
          sizeBytes: 1,
          mtimeMs: 1,
          width: 1,
          height: 1,
          createdAt: 1
        }
      ],
      1
    )

    const result = await roots.add(folder('outputs'))

    expect(result).toMatchObject({ outcome: AddRootOutcome.Added, absorbedRoots: 1 })
    const list = roots.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ path: join(dir, 'outputs'), imageCount: 1 })
    const relPaths = directories.listByRoot(list[0]?.id as RootId).map((d) => d.relPath)
    expect(relPaths).toContain('2026-09-27')
  })

  it('never leaves nested roots when adds of parent folders overlap', async () => {
    blockScans = true
    roots = makeRoots(instantResolver)
    await roots.add(folder('outputs/a/b'))

    const results = await Promise.all([
      roots.add(folder('outputs/a')),
      roots.add(folder('outputs'))
    ])

    expect(results.map((result) => result.outcome)).toEqual([
      AddRootOutcome.Added,
      AddRootOutcome.Added
    ])
    expect(roots.list().map((root) => root.path)).toEqual([join(dir, 'outputs')])
  })

  it('returns AlreadyAdded rather than throwing when the same parent is added twice at once', async () => {
    blockScans = true
    roots = makeRoots(instantResolver)
    await roots.add(folder('outputs/a'))
    const path = folder('outputs')

    const outcomes = (await Promise.all([roots.add(path), roots.add(path)])).map((r) => r.outcome)

    expect(outcomes).toEqual([AddRootOutcome.Added, AddRootOutcome.AlreadyAdded])
  })

  it('cancels a running scan before removing the root', async () => {
    blockScans = true
    await roots.add(folder('outputs'))
    const id = roots.list()[0]?.id as RootId
    expect(roots.list()[0]?.scanning).toBe(true)

    expect(await roots.remove(id)).toBe(true)
    expect(roots.list()).toEqual([])
  })

  it('rescans a known root and rejects an unknown one', async () => {
    await roots.add(folder('outputs'))
    const id = roots.list()[0]?.id as RootId
    await settle()
    await expect(roots.rescan(id)).resolves.toBe(true)
    await expect(roots.rescan(999 as RootId)).rejects.toThrow(UnknownRootError)
  })
})
