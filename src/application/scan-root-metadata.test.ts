import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredGeneration } from '@domain/generation'
import type { ImageId, LibraryRoot } from '@domain/library'
import { SqliteDirectoryRepository } from '@infrastructure/db/repositories/sqlite-directory-repository'
import { SqliteGenerationRepository } from '@infrastructure/db/repositories/sqlite-generation-repository'
import { SqliteImageRepository } from '@infrastructure/db/repositories/sqlite-image-repository'
import { SqliteImageVersionCheck } from '@infrastructure/db/repositories/sqlite-image-version-check'
import { SqliteLibraryRootRepository } from '@infrastructure/db/repositories/sqlite-library-root-repository'
import { SqliteMetadataRecordRepository } from '@infrastructure/db/repositories/sqlite-metadata-record-repository'
import { SqliteModelCatalog } from '@infrastructure/db/repositories/sqlite-model-catalog'
import { migratedMemoryDb } from '@infrastructure/db/testing/migrated-memory-db'
import { NodeLogFileSource } from '@infrastructure/fs/node-log-file-source'
import { FooocusLogParser } from '@infrastructure/metadata/fooocus-log-parser'
import { MetadataRecordReader } from '@infrastructure/metadata/metadata-record-reader'
import { GeneratorKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { createScanRoot } from '../service/scan-root-factory'
import { FooocusLogIndexer } from './fooocus-log-indexer'
import { ImageMetadataIndex } from './image-metadata-index'

const FIXTURES = resolve(__dirname, '../../tests/fixtures/fooocus')
const NO_METADATA_PNG = '2026-09-27_20-47-27_2563.png'
const A1111_WEBP = '2026-09-27_20-43-28_2563.webp'
const FOOOCUS_WEBP = '2026-09-27_20-45-48_2563.webp'

let dir: string
let db: Database.Database
let root: LibraryRoot
let images: SqliteImageRepository

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genfolio-meta-'))
  cpSync(FIXTURES, join(dir, 'day'), {
    recursive: true,
    filter: (path) => !path.includes('expected')
  })
  db = migratedMemoryDb()
  images = new SqliteImageRepository(db)
  root = new SqliteLibraryRootRepository(db).add(dir, 1)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const newScanner = (): ReturnType<typeof createScanRoot> =>
  createScanRoot(
    db,
    {
      directories: new SqliteDirectoryRepository(db),
      images,
      logger: { warn: vi.fn() },
      fileRef: (path) => path,
      now: () => Date.now()
    },
    { batchSize: 500, headerConcurrency: 4, progressIntervalMs: 0 }
  )

const scan = (
  scope?: readonly string[],
  scanner = newScanner()
): ReturnType<ReturnType<typeof createScanRoot>['run']> =>
  scanner.run(root, new AbortController().signal, undefined, scope)

function imageId(relDir: string, fileName: string): ImageId {
  const stat = images
    .fileStatsByRoot(root.id)
    .find((s) => s.relDir === relDir && s.fileName === fileName)
  if (!stat) throw new Error(`${relDir}/${fileName} not indexed`)
  return stat.id
}

function generationOf(fileName: string, relDir = 'day'): StoredGeneration | undefined {
  const versions = new SqliteImageVersionCheck(db)
  return new SqliteGenerationRepository(db, new SqliteModelCatalog(db), versions).find(
    imageId(relDir, fileName)
  )
}

const recordOrigins = (fileName: string): string[] =>
  new SqliteMetadataRecordRepository(db, new SqliteImageVersionCheck(db))
    .list(imageId('day', fileName))
    .map((record) => record.origin)

describe('ScanRoot metadata indexing', () => {
  it('stores a generation for every fixture, filling gaps from log.html', async () => {
    expect(await scan()).toMatchObject({ added: 6, failed: 0 })
    expect(db.prepare('SELECT COUNT(*) FROM generations').pluck().get()).toBe(6)

    const bare = generationOf(NO_METADATA_PNG)
    expect(bare).toMatchObject({
      origin: MetadataOrigin.FooocusLog,
      generator: GeneratorKind.FwdFooocus,
      checkpoint: { name: 'intorealism_sdxlV4' },
      loras: [{ name: 'sd_xl_dpo_lora_v1-128dim', weight: 0.5, hash: null }]
    })
    expect(bare?.prompt).toContain('café table')

    const a1111 = generationOf(A1111_WEBP)
    expect(a1111?.origin).toBe(MetadataOrigin.FooocusLog)
    expect(a1111?.prompt).toContain('café table')
    expect(a1111?.prompt).toContain('桜 petals')
    expect(a1111?.checkpoint).toEqual({ name: 'intorealism_sdxlV4', hash: 'c23324c71c' })
    expect(a1111?.loras).toEqual([{ name: 'add-detail-xl', weight: 0.6, hash: '0d9bd1b873' }])
    expect(recordOrigins(A1111_WEBP)).toContain(MetadataOrigin.FooocusLog)

    expect(generationOf(FOOOCUS_WEBP)?.origin).toBe(MetadataOrigin.ExifUserComment)
  })

  it('does no metadata work when nothing changed', async () => {
    await scan()
    const read = vi.spyOn(MetadataRecordReader.prototype, 'read')
    const parse = vi.spyOn(FooocusLogParser.prototype, 'parse')
    expect(await scan()).toMatchObject({ added: 0, updated: 0, unchanged: 6 })
    expect(read).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
  })

  it('re-reads a log whose file changed, even with no image changed', async () => {
    await scan()
    const logPath = join(dir, 'day', 'log.html')
    const edited = readFileSync(logPath, 'utf8').replace(
      encodeURIComponent('sd_xl_dpo_lora_v1-128dim.safetensors : 0.5'),
      encodeURIComponent('sd_xl_dpo_lora_v1-128dim.safetensors : 0.9')
    )
    writeFileSync(logPath, edited)
    const parse = vi.spyOn(FooocusLogParser.prototype, 'parse')
    expect(await scan()).toMatchObject({ unchanged: 6 })
    expect(parse).toHaveBeenCalledTimes(1)
    expect(generationOf(NO_METADATA_PNG)?.loras?.[0]?.weight).toBe(0.9)
  })

  it('loads only the scoped folders stored rows and directories in a scoped scan', async () => {
    await scan()
    const statsByRoot = vi.spyOn(SqliteImageRepository.prototype, 'fileStatsByRoot')
    const statsByDirectories = vi.spyOn(SqliteImageRepository.prototype, 'fileStatsByDirectories')
    const listByRoot = vi.spyOn(SqliteDirectoryRepository.prototype, 'listByRoot')

    await scan(['day'])

    expect(statsByRoot).not.toHaveBeenCalled()
    expect(listByRoot).not.toHaveBeenCalled()
    expect(statsByDirectories).toHaveBeenCalledWith(root.id, ['day'])
  })

  it('re-reads a rewritten log in a scan scoped to its folder (live changes)', async () => {
    await scan()
    const logPath = join(dir, 'day', 'log.html')
    writeFileSync(
      logPath,
      readFileSync(logPath, 'utf8').replace(
        encodeURIComponent('sd_xl_dpo_lora_v1-128dim.safetensors : 0.5'),
        encodeURIComponent('sd_xl_dpo_lora_v1-128dim.safetensors : 0.7')
      )
    )
    await scan(['day'])
    expect(generationOf(NO_METADATA_PNG)?.loras?.[0]?.weight).toBe(0.7)
  })

  it('re-applies the log after a scan that stopped between indexing and the log pass', async () => {
    await scan()
    const png = join(dir, 'day', NO_METADATA_PNG)
    utimesSync(png, new Date(), new Date(Date.now() + 5000))
    const refresh = vi
      .spyOn(FooocusLogIndexer.prototype, 'refresh')
      .mockRejectedValueOnce(new Error('aborted'))
    await expect(scan()).rejects.toThrow('aborted')
    refresh.mockRestore()
    await scan()
    expect(generationOf(NO_METADATA_PNG)?.origin).toBe(MetadataOrigin.FooocusLog)
  })

  it('does not read or parse an unchanged log again when a new image arrives beside it', async () => {
    const scanner = newScanner()
    await scan(undefined, scanner)
    cpSync(join(FIXTURES, NO_METADATA_PNG), join(dir, 'day', '2026-09-27_21-00-00_1.png'))
    const parse = vi.spyOn(FooocusLogParser.prototype, 'parse')
    const read = vi.spyOn(NodeLogFileSource.prototype, 'read')

    expect(await scan(['day'], scanner)).toMatchObject({ added: 1, unchanged: 6 })

    expect(parse).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    expect(generationOf(NO_METADATA_PNG)?.origin).toBe(MetadataOrigin.FooocusLog)
  })

  it('parses a log again once its file changed, even if it was parsed before', async () => {
    const scanner = newScanner()
    await scan(undefined, scanner)
    const logPath = join(dir, 'day', 'log.html')
    utimesSync(logPath, new Date(), new Date(Date.now() + 5000))
    const parse = vi.spyOn(FooocusLogParser.prototype, 'parse')

    await scan(['day'], scanner)

    expect(parse).toHaveBeenCalledTimes(1)
  })

  it('reads the stored log records of a folder once instead of every image', async () => {
    await scan()
    utimesSync(join(dir, 'day', 'log.html'), new Date(), new Date(Date.now() + 5000))
    const storedRecords = vi.spyOn(ImageMetadataIndex.prototype, 'storedRecords')
    const storedValues = vi.spyOn(ImageMetadataIndex.prototype, 'storedValuesInDirectory')

    await scan(['day'])

    expect(storedValues).toHaveBeenCalledTimes(1)
    expect(storedRecords).not.toHaveBeenCalled()
  })

  it('drops log data when the log is deleted', async () => {
    await scan()
    rmSync(join(dir, 'day', 'log.html'))
    await scan()
    expect(generationOf(NO_METADATA_PNG)).toBeUndefined()
    expect(generationOf(A1111_WEBP)?.prompt).toContain('caf? table')
  })

  it('reindexes images indexed before metadata extraction existed', async () => {
    await scan()
    db.exec(
      'UPDATE images SET metadata_version = 0; DELETE FROM generations; DELETE FROM metadata_raw'
    )
    expect(await scan()).toMatchObject({ updated: 6, unchanged: 0 })
    expect(db.prepare('SELECT COUNT(*) FROM generations').pluck().get()).toBe(6)
  })

  it('reads an A1111 sidecar written beside an image', async () => {
    mkdirSync(join(dir, 'a1111'))
    cpSync(join(FIXTURES, NO_METADATA_PNG), join(dir, 'a1111', 'x.png'))
    writeFileSync(join(dir, 'a1111', 'x.txt'), 'a cat\nSteps: 20, Sampler: Euler a, Seed: 7')
    await scan()
    expect(generationOf('x.png', 'a1111')).toMatchObject({
      origin: MetadataOrigin.SidecarTxt,
      prompt: 'a cat',
      seed: '7'
    })
  })

  it('keeps favourites, ratings, tags and album membership when a changed file is re-indexed', async () => {
    await scan()
    const id = imageId('day', A1111_WEBP)
    db.prepare('UPDATE images SET is_favorite = 1, rating = 4 WHERE id = ?').run(id)
    db.exec("INSERT INTO tags (id, name, name_key, created_at) VALUES (1, 'keeper', 'keeper', 1)")
    db.prepare('INSERT INTO image_tags VALUES (?, 1)').run(id)
    db.exec(
      "INSERT INTO albums (id, name, name_key, kind, created_at) VALUES (1, 'best', 'best', 'manual', 1)"
    )
    db.prepare('INSERT INTO album_images VALUES (1, ?, 1.0)').run(id)
    const path = join(dir, 'day', A1111_WEBP)
    utimesSync(path, new Date(), new Date(Date.now() + 5000))
    expect(await scan()).toMatchObject({ updated: 1 })
    expect(imageId('day', A1111_WEBP)).toBe(id)
    expect(db.prepare('SELECT is_favorite, rating FROM images WHERE id = ?').get(id)).toEqual({
      is_favorite: 1,
      rating: 4
    })
    expect(db.prepare('SELECT COUNT(*) FROM image_tags WHERE image_id = ?').pluck().get(id)).toBe(1)
    expect(db.prepare('SELECT COUNT(*) FROM album_images WHERE image_id = ?').pluck().get(id)).toBe(
      1
    )
  })

  it('ignores logs under lists/', async () => {
    mkdirSync(join(dir, 'lists', 'favourites'), { recursive: true })
    cpSync(join(FIXTURES, NO_METADATA_PNG), join(dir, 'lists', 'favourites', NO_METADATA_PNG))
    cpSync(join(FIXTURES, 'log.html'), join(dir, 'lists', 'favourites', 'log.html'))
    await scan()
    expect(generationOf(NO_METADATA_PNG, 'lists/favourites')).toBeUndefined()
  })
})
