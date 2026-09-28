import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryId, ImageFile, ImageId } from '@domain/library'
import { HASH_VERSION } from '@domain/perceptual-hash'
import { SqliteDirectoryRepository } from '@infrastructure/db/repositories/sqlite-directory-repository'
import { SqliteImageHashRepository } from '@infrastructure/db/repositories/sqlite-image-hash-repository'
import { SqliteImageRepository } from '@infrastructure/db/repositories/sqlite-image-repository'
import { SqliteLibraryRootRepository } from '@infrastructure/db/repositories/sqlite-library-root-repository'
import { SqliteImageLocator } from '@infrastructure/db/sqlite-image-locator'
import { migratedMemoryDb } from '@infrastructure/db/testing/migrated-memory-db'
import { NapiImageHasher } from '@infrastructure/imaging/napi-image-hasher'
import { ImageFormat } from '@shared/image-format'
import { HashIndexer } from './hash-indexer'
import { ImageFileResolver } from './image-file-resolver'

const FIXTURES = resolve(__dirname, '../../tests/fixtures/fooocus')
let dir: string
let db: Database.Database
let ids: ImageId[]

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'genfolio-hash-')))
  const names = readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.png'))
    .slice(0, 2)
  names.forEach((name, index) => copyFileSync(join(FIXTURES, name), join(dir, `${index}.png`)))
  writeFileSync(join(dir, 'broken.png'), 'not an image')
  db = migratedMemoryDb()
  const root = new SqliteLibraryRootRepository(db).add(dir, 1)
  const directoryId: DirectoryId = new SqliteDirectoryRepository(db).ensure(root.id, '')
  const file = (fileName: string): ImageFile => ({
    directoryId,
    fileName,
    format: ImageFormat.Png,
    sizeBytes: 1,
    mtimeMs: 1,
    width: 1,
    height: 1,
    createdAt: 1
  })
  ids = new SqliteImageRepository(db)
    .upsertMany(['0.png', '1.png', 'broken.png', 'gone.png'].map(file), 1)
    .map((version) => version.id)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function indexer(): HashIndexer {
  const files = new ImageFileResolver(new SqliteImageLocator(db), {
    open: (path) => open(path, 'r'),
    realpath,
    stat
  })
  return new HashIndexer(
    new SqliteImageHashRepository(db),
    files,
    new NapiImageHasher(),
    { run: (work) => db.transaction(work)() },
    { batchSize: 3, concurrency: 2 }
  )
}

const rows = (): { id: number; hashed: number; sha: number; dhash: bigint | null }[] =>
  db
    .prepare(
      'SELECT id, hash_version AS hashed, length(content_sha256) AS sha, dhash FROM images ORDER BY id'
    )
    .safeIntegers(true)
    .all()
    .map((row) => {
      const { id, hashed, sha, dhash } = row as Record<string, bigint | null>
      return { id: Number(id), hashed: Number(hashed), sha: Number(sha ?? 0), dhash: dhash ?? null }
    })

describe('HashIndexer', () => {
  it('hashes every pending image in batches and marks unreadable ones as done without hashes', async () => {
    const progress = vi.fn()
    const hashed = await indexer().run(new AbortController().signal, progress)
    expect(hashed).toEqual(ids)
    const stored = rows()
    expect(stored.map((row) => row.hashed)).toEqual([
      HASH_VERSION,
      HASH_VERSION,
      HASH_VERSION,
      HASH_VERSION
    ])
    expect(stored.map((row) => row.sha)).toEqual([32, 32, 0, 0])
    expect(stored[0]?.dhash).not.toBeNull()
    expect(stored[2]?.dhash).toBeNull()
    expect(progress).toHaveBeenNthCalledWith(1, 0, 4)
    expect(progress).toHaveBeenLastCalledWith(4, 4)
    expect(await indexer().run(new AbortController().signal, progress)).toEqual([])
  })

  it('keeps the hashes of an image that changed while it was being hashed out', async () => {
    const hashes = new SqliteImageHashRepository(db)
    const [first] = hashes.pending(HASH_VERSION, 0, 1)
    if (!first) throw new Error('nothing pending')
    db.prepare('UPDATE images SET size_bytes = 99 WHERE id = ?').run(first.id)
    expect(
      hashes.store(first, { sha256: new Uint8Array(32), dhash: 1n, phash: 2n }, HASH_VERSION)
    ).toBe(false)
    expect(rows()[0]?.hashed).toBe(0)
  })

  it('stores hashes with the top bit set as signed 64-bit values', () => {
    const hashes = new SqliteImageHashRepository(db)
    const [first] = hashes.pending(HASH_VERSION, 0, 1)
    if (!first) throw new Error('nothing pending')
    hashes.store(first, { sha256: new Uint8Array(32), dhash: (1n << 64n) - 1n, phash: 0n }, 1)
    expect(rows()[0]?.dhash).toBe(-1n)
  })

  it('stops when aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('stopped'))
    await expect(indexer().run(controller.signal, () => undefined)).rejects.toThrow('stopped')
  })
})
