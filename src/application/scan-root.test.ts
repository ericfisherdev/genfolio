import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryRoot } from '@domain/library'
import { ScanPhase, type ScanProgress } from '@domain/scan'
import { SqliteDirectoryRepository } from '@infrastructure/db/repositories/sqlite-directory-repository'
import { SqliteImageRepository } from '@infrastructure/db/repositories/sqlite-image-repository'
import { SqliteLibraryRootRepository } from '@infrastructure/db/repositories/sqlite-library-root-repository'
import { migratedMemoryDb } from '@infrastructure/db/testing/migrated-memory-db'
import { encodeSolid, gifHeader } from '@infrastructure/imaging/testing/synthetic-images'
import { createScanRoot } from '../service/scan-root-factory'
import { ScanAlreadyRunningError, type ScanRoot, type ScanRootOptions } from './scan-root'

let dir: string
let db: Database.Database
let images: SqliteImageRepository
let root: LibraryRoot

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genfolio-scan-'))
  db = migratedMemoryDb()
  images = new SqliteImageRepository(db)
  root = new SqliteLibraryRootRepository(db).add(dir, 1)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(relPath: string, bytes: Uint8Array): string {
  const path = join(dir, relPath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, bytes)
  return path
}

function scanner(options?: Partial<ScanRootOptions>): ScanRoot {
  return createScanRoot(
    db,
    {
      directories: new SqliteDirectoryRepository(db),
      images,
      logger: { warn: vi.fn() },
      fileRef: (path) => path,
      now: () => Date.now()
    },
    { batchSize: 500, headerConcurrency: 8, progressIntervalMs: 0, ...options }
  )
}

const scan = (
  scanRoot = scanner(),
  onProgress?: (progress: ScanProgress) => void
): ReturnType<ScanRoot['run']> => scanRoot.run(root, new AbortController().signal, onProgress)

const indexed = (): string[] =>
  images
    .fileStatsByRoot(root.id)
    .map((stat) => (stat.relDir ? `${stat.relDir}/${stat.fileName}` : stat.fileName))
    .sort()

async function buildTree(): Promise<void> {
  write('top.png', await encodeSolid('png', 6, 4))
  write('2026/09/a.jpg', await encodeSolid('jpeg', 6, 4))
  write('2026/09/27/b.webp', await encodeSolid('webp', 6, 4))
  write('2026/09/27/c.avif', await encodeSolid('avif', 6, 4))
  write('2026/d.gif', gifHeader(3, 2))
  write('.cache/hidden.png', await encodeSolid('png', 6, 4))
  write('notes.txt', Buffer.from('text'))
  write('2026/broken.png', Buffer.from('not an image'))
  symlinkSync(dir, join(dir, 'loop'))
}

describe('ScanRoot', () => {
  it('indexes every readable image and skips hidden, linked, non-image and broken files', async () => {
    await buildTree()
    const report = await scan()

    expect(report).toEqual({ added: 5, updated: 0, unchanged: 0, removed: 0, failed: 1 })
    expect(indexed()).toEqual([
      '2026/09/27/b.webp',
      '2026/09/27/c.avif',
      '2026/09/a.jpg',
      '2026/d.gif',
      'top.png'
    ])
  })

  it('writes nothing on a rescan when nothing changed', async () => {
    await buildTree()
    await scan()
    const upsert = vi.spyOn(images, 'upsertMany')
    const deletes = vi.spyOn(images, 'deleteMany')

    const report = await scan()

    expect(report).toMatchObject({ added: 0, updated: 0, unchanged: 5, removed: 0 })
    expect(upsert).not.toHaveBeenCalled()
    expect(deletes).toHaveBeenCalledWith([])
  })

  it('reflects added, modified and deleted files on a rescan and prunes emptied folders', async () => {
    await buildTree()
    await scan()
    const modified = write('top.png', await encodeSolid('png', 10, 8))
    utimesSync(modified, new Date(2030, 0, 1), new Date(2030, 0, 1))
    write('new/e.png', await encodeSolid('png', 6, 4))
    unlinkSync(join(dir, '2026/09/27/b.webp'))
    unlinkSync(join(dir, '2026/09/27/c.avif'))

    const report = await scan()

    expect(report).toMatchObject({ added: 1, updated: 1, removed: 2 })
    expect(indexed()).toContain('new/e.png')
    const top = db.prepare("SELECT width, height FROM images WHERE file_name = 'top.png'").get()
    expect(top).toEqual({ width: 10, height: 8 })
    const dirs = new SqliteDirectoryRepository(db).listByRoot(root.id).map((d) => d.relPath)
    expect(dirs).not.toContain('2026/09/27')
  })

  it('uses the Fooocus file name as the creation time, otherwise the mtime', async () => {
    const plain = write('plain.png', await encodeSolid('png', 6, 4))
    utimesSync(plain, new Date(2020, 0, 2), new Date(2020, 0, 2))
    write('2026-09-27_14-03-11_1234.png', await encodeSolid('png', 6, 4))
    await scan()

    const createdAt = (name: string): unknown =>
      (
        db.prepare('SELECT created_at FROM images WHERE file_name = ?').get(name) as {
          created_at: number
        }
      ).created_at
    expect(createdAt('2026-09-27_14-03-11_1234.png')).toBe(
      new Date(2026, 8, 27, 14, 3, 11).getTime()
    )
    expect(createdAt('plain.png')).toBe(new Date(2020, 0, 2).getTime())
  })

  it('reports walking, indexing and pruning progress', async () => {
    await buildTree()
    const phases = new Set<ScanPhase>()
    await scan(scanner(), (progress) => phases.add(progress.phase))
    expect([...phases]).toEqual([ScanPhase.Walking, ScanPhase.Indexing, ScanPhase.Pruning])
  })

  it('stops at a batch boundary when aborted and leaves a consistent, resumable database', async () => {
    const png = await encodeSolid('png', 6, 4)
    for (let i = 0; i < 20; i++) write(`batch/${i}.png`, png)
    const controller = new AbortController()
    const upsert = vi.spyOn(images, 'upsertMany')
    upsert.mockImplementation((batch, addedAt) => {
      const versions = SqliteImageRepository.prototype.upsertMany.call(images, batch, addedAt)
      controller.abort()
      return versions
    })

    await expect(
      scanner({ batchSize: 5, headerConcurrency: 1 }).run(root, controller.signal)
    ).rejects.toThrow()
    expect(indexed()).toHaveLength(5)

    upsert.mockRestore()
    expect(await scan()).toMatchObject({ added: 15, unchanged: 5 })
    expect(indexed()).toHaveLength(20)
  })
})

describe('ScanRoot failure safety', () => {
  it('rejects and keeps every row when the root has gone missing', async () => {
    await buildTree()
    await scan()
    renameSync(dir, `${dir}-moved`)
    try {
      await expect(scan()).rejects.toThrow(/ENOENT/)
      expect(images.countByRoot(root.id)).toBe(5)
    } finally {
      renameSync(`${dir}-moved`, dir)
    }
  })

  it.skipIf(process.getuid?.() === 0)(
    'keeps rows under a subdirectory that became unreadable',
    async () => {
      await buildTree()
      await scan()
      chmodSync(join(dir, '2026/09'), 0o000)
      try {
        const report = await scan()
        expect(report.removed).toBe(0)
        expect(indexed()).toContain('2026/09/27/b.webp')
      } finally {
        chmodSync(join(dir, '2026/09'), 0o755)
      }
    }
  )

  it('refuses to run twice at once for the same root', async () => {
    write('a.png', await encodeSolid('png', 6, 4))
    const scanRoot = scanner()
    const first = scanRoot.run(root, new AbortController().signal)
    await expect(scanRoot.run(root, new AbortController().signal)).rejects.toBeInstanceOf(
      ScanAlreadyRunningError
    )
    await first
    await expect(scanRoot.run(root, new AbortController().signal)).resolves.toBeDefined()
  })

  it('fails the scan on a database error instead of counting the image as failed', async () => {
    write('a.png', await encodeSolid('png', 6, 4))
    vi.spyOn(SqliteDirectoryRepository.prototype, 'ensure').mockImplementation(() => {
      throw new Error('SQLITE_FULL: database or disk is full')
    })
    await expect(scan()).rejects.toThrow('SQLITE_FULL')
  })
})

describe.skipIf(process.env['GENFOLIO_PERF'] !== '1')('ScanRoot performance', () => {
  it('scans a 20k-file synthetic tree in under 30 s (warm cache)', async () => {
    const source = write('source.png', await encodeSolid('png', 6, 4))
    for (let folder = 0; folder < 100; folder++) {
      mkdirSync(join(dir, `f${folder}`))
      for (let i = 0; i < 200; i++) copyFileSync(source, join(dir, `f${folder}`, `${i}.png`))
    }
    unlinkSync(source)
    const started = performance.now()
    const report = await scan()
    const seconds = (performance.now() - started) / 1000
    console.info(`[perf] scanned ${report.added} files in ${seconds.toFixed(1)} s`)
    expect(report.added).toBe(20_000)
    expect(seconds).toBeLessThan(30)
  }, 120_000)
})
