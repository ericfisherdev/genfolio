import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import type { StoredGeneration } from '@domain/generation'
import type { DirectoryId, ImageId } from '@domain/library'
import type { MetadataRecord } from '@domain/metadata-record'
import type { ImageVersion } from '@domain/repositories'
import { GeneratorKind, ModelKind } from '@shared/generation-kinds'
import { ImageFormat } from '@shared/image-format'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { MigrationRunner } from '../migration-runner'
import { migrations } from '../migrations'
import { migratedMemoryDb } from '../testing/migrated-memory-db'
import { SqliteDirectoryRepository } from './sqlite-directory-repository'
import { SqliteFooocusLogRepository } from './sqlite-fooocus-log-repository'
import { SqliteGenerationRepository } from './sqlite-generation-repository'
import { SqliteImageRepository } from './sqlite-image-repository'
import { SqliteImageVersionCheck } from './sqlite-image-version-check'
import { SqliteLibraryRootRepository } from './sqlite-library-root-repository'
import { SqliteMetadataRecordRepository } from './sqlite-metadata-record-repository'
import { SqliteModelCatalog } from './sqlite-model-catalog'

let db: Database.Database
let generations: SqliteGenerationRepository
let records: SqliteMetadataRecordRepository
let roots: SqliteLibraryRootRepository
let directory: DirectoryId

beforeEach(() => {
  db = migratedMemoryDb()
  const versions = new SqliteImageVersionCheck(db)
  generations = new SqliteGenerationRepository(db, new SqliteModelCatalog(db), versions)
  records = new SqliteMetadataRecordRepository(db, versions)
  roots = new SqliteLibraryRootRepository(db)
  directory = new SqliteDirectoryRepository(db).ensure(roots.add('/lib', 1).id, 'day')
})

function addImage(fileName: string): ImageVersion {
  new SqliteImageRepository(db).upsertMany(
    [
      {
        directoryId: directory,
        fileName,
        format: ImageFormat.Png,
        sizeBytes: 1,
        mtimeMs: 1,
        width: 1024,
        height: 1024,
        createdAt: 1
      }
    ],
    1
  )
  const row = db.prepare('SELECT id FROM images WHERE file_name = ?').get(fileName) as {
    id: number
  }
  return { id: row.id as ImageId, sizeBytes: 1, mtimeMs: 1 }
}

const FULL: StoredGeneration = {
  generator: GeneratorKind.FwdFooocus,
  origin: MetadataOrigin.PngText,
  prompt: 'a teapot, 桜',
  negativePrompt: 'blurry',
  seed: '4590034657615269725',
  steps: 30,
  cfgScale: 2.66,
  sampler: 'dpmpp_2m_sde_gpu',
  scheduler: 'karras',
  width: 1024,
  height: 1024,
  checkpoint: { name: 'intorealism_sdxlV4', hash: 'c23324c71c' },
  refiner: { name: 'refiner', hash: null },
  vae: 'Default (model)',
  loras: [
    { name: 'add-detail-xl', weight: 0.6, hash: '0d9bd1b873' },
    { name: 'Pony Realism Slider', weight: null, hash: null }
  ],
  styles: ['Fooocus V2', 'SAI Neonpunk'],
  performance: 'Speed',
  params: { Steps: '30', 'Lora weights': 'add-detail-xl: 0.6' }
}

const count = (table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n

describe('migrations from version 2', () => {
  it('upgrades a version 2 library to the latest version and keeps its rows', () => {
    const old = new Database(':memory:')
    old.pragma('foreign_keys = ON')
    new MigrationRunner(old, migrations.slice(0, 2)).migrate()
    old.exec("INSERT INTO library_roots (path, added_at) VALUES ('/lib', 1)")
    expect(new MigrationRunner(old, migrations).migrate()).toBe(migrations.length)
    expect(old.pragma('user_version', { simple: true })).toBe(migrations.length)
    expect(old.prepare('SELECT path FROM library_roots').pluck().all()).toEqual(['/lib'])
  })
})

describe('SqliteGenerationRepository', () => {
  it('stores and reads back every field', () => {
    const image = addImage('a.png')
    generations.replace(image, FULL)
    expect(generations.find(image.id)).toEqual(FULL)
  })

  it('stores a sparse generation without inventing fields', () => {
    const image = addImage('a.png')
    const sparse: StoredGeneration = {
      generator: GeneratorKind.UnFooocused,
      origin: MetadataOrigin.ExifImageDescription,
      prompt: 'a cat',
      params: {}
    }
    generations.replace(image, sparse)
    expect(generations.find(image.id)).toEqual(sparse)
  })

  it('replacing twice leaves no orphan links and reuses models by name identity', () => {
    const first = addImage('a.png')
    const second = addImage('b.png')
    generations.replace(first, FULL)
    generations.replace(first, FULL)
    generations.replace(second, {
      ...FULL,
      checkpoint: { name: 'sdxl/IntoRealism_sdxlV4.safetensors', hash: null },
      loras: [{ name: 'loras/ADD-DETAIL-XL.safetensors', weight: 1, hash: '0123456789ab' }]
    })
    expect(count('generations')).toBe(2)
    expect(count('generation_loras')).toBe(3)
    expect(db.prepare('SELECT kind, display_name FROM models ORDER BY id').all()).toEqual([
      { kind: 'checkpoint', display_name: 'intorealism_sdxlV4' },
      { kind: 'checkpoint', display_name: 'refiner' },
      { kind: 'lora', display_name: 'add-detail-xl' },
      { kind: 'lora', display_name: 'Pony Realism Slider' }
    ])
    expect(db.prepare('SELECT hash, hash_kind FROM model_hashes ORDER BY hash').all()).toEqual([
      { hash: '0123456789ab', hash_kind: 'a1111-lora' },
      { hash: '0d9bd1b873', hash_kind: 'autov2' },
      { hash: 'c23324c71c', hash_kind: 'autov2' }
    ])
    expect(generations.find(second.id)?.checkpoint).toEqual({
      name: 'intorealism_sdxlV4',
      hash: null
    })
  })

  it('keeps the first position when two LoRA names share an identity', () => {
    const image = addImage('a.png')
    generations.replace(image, {
      ...FULL,
      loras: [
        { name: 'detail', weight: 0.5, hash: null },
        { name: 'Detail.safetensors', weight: 0.9, hash: null }
      ]
    })
    expect(generations.find(image.id)?.loras).toEqual([{ name: 'detail', weight: 0.5, hash: null }])
  })

  it('writes nothing and returns false when the image changed or vanished since it was read', () => {
    const image = addImage('a.png')
    expect(generations.replace(image, FULL)).toBe(true)
    const stale = { ...image, mtimeMs: 0 }
    expect(generations.replace(stale, null)).toBe(false)
    expect(records.replace(stale, [{ origin: MetadataOrigin.PngText, key: 'k', value: 'v' }])).toBe(
      false
    )
    expect(generations.find(image.id)).toEqual(FULL)
    expect(records.list(image.id)).toEqual([])
    db.prepare('DELETE FROM images WHERE id = ?').run(image.id)
    expect(generations.replace(image, FULL)).toBe(false)
    expect(records.replace(image, [])).toBe(false)
  })

  it('null removes the generation and its links', () => {
    const image = addImage('a.png')
    generations.replace(image, FULL)
    generations.replace(image, null)
    expect(generations.find(image.id)).toBeUndefined()
    expect(count('generation_loras')).toBe(0)
  })

  it('prunes models no generation uses', () => {
    const image = addImage('a.png')
    generations.replace(image, FULL)
    const { refiner, ...withoutRefiner } = FULL
    expect(refiner).toBeDefined()
    generations.replace(image, { ...withoutRefiner, loras: [] })
    expect(generations.pruneUnusedModels()).toBe(3)
    expect(db.prepare('SELECT display_name FROM models').pluck().all()).toEqual([
      'intorealism_sdxlV4'
    ])
    expect(count('model_hashes')).toBe(1)
  })
})

describe('cascades', () => {
  it('deleting an image removes its generation, links and raw records', () => {
    const image = addImage('a.png')
    generations.replace(image, FULL)
    records.replace(image, [{ origin: MetadataOrigin.PngText, key: 'parameters', value: 'x' }])
    db.prepare('DELETE FROM images WHERE id = ?').run(image.id)
    expect([count('generations'), count('generation_loras'), count('metadata_raw')]).toEqual([
      0, 0, 0
    ])
  })

  it('removing a root removes its log stamps too', () => {
    const logs = new SqliteFooocusLogRepository(db)
    logs.save(directory, { sizeBytes: 10, mtimeMs: 20 })
    for (const root of roots.list()) roots.remove(root.id)
    expect(count('fooocus_logs')).toBe(0)
  })
})

describe('SqliteGenerationRepository.replaceFresh', () => {
  it('replaces a generation of a row written in this transaction without a version check', () => {
    const image = addImage('a.png')
    generations.replaceFresh(image.id, FULL)
    generations.replaceFresh(image.id, { ...FULL, prompt: 'second' })
    expect(generations.find(image.id)?.prompt).toBe('second')
    expect(db.prepare('SELECT COUNT(*) FROM generations').pluck().get()).toBe(1)
    generations.replaceFresh(image.id, null)
    expect(generations.find(image.id)).toBeUndefined()
  })
})

describe('SqliteMetadataRecordRepository', () => {
  it('replaces and lists records in stored order', () => {
    const image = addImage('a.png')
    records.replace(image, [{ origin: MetadataOrigin.SidecarTxt, key: 'parameters', value: 'old' }])
    const next = [
      { origin: MetadataOrigin.ExifSoftware, key: 'Software', value: 'Fooocus v2.5.5' },
      { origin: MetadataOrigin.ExifUserComment, key: 'UserComment', value: '{}' }
    ]
    records.replace(image, next)
    expect(records.list(image.id)).toEqual(next)
  })

  it('replaces records of a row written in this transaction without a version check', () => {
    const image = addImage('a.png')
    const log = (value: string): MetadataRecord => ({
      origin: MetadataOrigin.FooocusLog,
      key: 'log.html',
      value
    })
    records.replaceFresh(image.id, [log('one'), log('two')])
    records.replaceFresh(image.id, [log('three')])
    expect(records.list(image.id)).toEqual([log('three')])
  })

  it('reads one origin and key of every image in a directory by file name', () => {
    const a = addImage('a.png')
    const b = addImage('b.png')
    const bare = addImage('c.png')
    const log = (value: string): MetadataRecord => ({
      origin: MetadataOrigin.FooocusLog,
      key: 'log.html',
      value
    })
    const exif: MetadataRecord = {
      origin: MetadataOrigin.ExifUserComment,
      key: 'UserComment',
      value: '{}'
    }
    records.replace(a, [exif, log('A')])
    records.replace(b, [log('B')])
    records.replace(bare, [exif])

    expect(records.valuesInDirectory(directory, MetadataOrigin.FooocusLog, 'log.html')).toEqual(
      new Map([
        ['a.png', 'A'],
        ['b.png', 'B']
      ])
    )
    expect(records.valuesInDirectory(directory, MetadataOrigin.FooocusLog, 'other')).toEqual(
      new Map()
    )
  })
})

describe('SqliteFooocusLogRepository', () => {
  it('saves and updates a directory log stamp', () => {
    const logs = new SqliteFooocusLogRepository(db)
    expect(logs.find(directory)).toBeUndefined()
    logs.save(directory, { sizeBytes: 10, mtimeMs: 20 })
    logs.save(directory, { sizeBytes: 11, mtimeMs: 21 })
    expect(logs.find(directory)).toEqual({ sizeBytes: 11, mtimeMs: 21 })
  })

  it('stores a fractional fs mtime truncated to whole milliseconds', () => {
    const logs = new SqliteFooocusLogRepository(db)
    logs.save(directory, { sizeBytes: 10, mtimeMs: 1790573219728.0945 })
    expect(logs.find(directory)).toEqual({ sizeBytes: 10, mtimeMs: 1790573219728 })
  })
})

describe('SqliteModelCatalog.idOfDisplayName', () => {
  it('finds a model by its stored display name without stripping another extension', () => {
    const catalog = new SqliteModelCatalog(db)
    const withInnerExtension = catalog.ensure(ModelKind.Lora, 'loras/foo.pt.safetensors', null)
    const plain = catalog.ensure(ModelKind.Lora, 'foo.safetensors', null)
    expect(catalog.idOfDisplayName(ModelKind.Lora, 'foo.pt')).toBe(withInnerExtension)
    expect(catalog.idOfDisplayName(ModelKind.Lora, 'FOO')).toBe(plain)
    expect(catalog.idOfDisplayName(ModelKind.Checkpoint, 'foo')).toBeUndefined()
  })
})
