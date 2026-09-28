import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredGeneration } from '@domain/generation'
import type { DirectoryId, ImageId } from '@domain/library'
import { galleryQuerySchema, GalleryScopeKind, SortOrder, type GalleryQuery } from '@shared/gallery'
import { GeneratorKind } from '@shared/generation-kinds'
import { ImageFormat } from '@shared/image-format'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { KeywordScope, SetMatchMode, type SearchFilters } from '@shared/search'
import { SqliteDirectoryRepository } from '../repositories/sqlite-directory-repository'
import { SqliteGenerationRepository } from '../repositories/sqlite-generation-repository'
import { SqliteImageRepository } from '../repositories/sqlite-image-repository'
import { SqliteImageVersionCheck } from '../repositories/sqlite-image-version-check'
import { SqliteLibraryRootRepository } from '../repositories/sqlite-library-root-repository'
import { SqliteModelCatalog } from '../repositories/sqlite-model-catalog'
import { SqliteGalleryReader } from '../sqlite-gallery-reader'
import { migratedMemoryDb } from '../testing/migrated-memory-db'
import { createSearchFilters } from './filters'

let db: Database.Database
let reader: SqliteGalleryReader
let folderB: DirectoryId
const ids = new Map<number, ImageId>()

const generation = (fields: Partial<StoredGeneration>): StoredGeneration => ({
  generator: GeneratorKind.A1111,
  origin: MetadataOrigin.PngText,
  params: {},
  ...fields
})

/** Six images: 1–3 in folder a, 4–6 in folder b; image 5 has no generation data. */
const LIBRARY: Record<number, StoredGeneration | null> = {
  1: generation({
    prompt: 'red hair girl, cyberpunk city',
    negativePrompt: 'blurry',
    seed: '1',
    checkpoint: { name: 'alpha', hash: null },
    loras: [
      { name: 'detail', weight: 0.8, hash: null },
      { name: 'style', weight: 1, hash: null }
    ]
  }),
  2: generation({
    generator: GeneratorKind.Fooocus,
    prompt: 'red car on a road',
    negativePrompt: 'low quality',
    seed: '2',
    checkpoint: { name: 'alpha', hash: null },
    loras: [{ name: 'detail', weight: 0.3, hash: null }]
  }),
  3: generation({
    generator: GeneratorKind.Fooocus,
    prompt: 'blue sky',
    negativePrompt: 'red',
    seed: '1',
    checkpoint: { name: 'beta', hash: null },
    loras: [{ name: 'style', weight: null, hash: null }]
  }),
  4: generation({
    prompt: 'red hair girl, cyberpunk city',
    seed: '3',
    checkpoint: { name: 'beta', hash: null }
  }),
  5: null,
  6: generation({
    prompt: 'café table',
    checkpoint: { name: 'beta', hash: null },
    refiner: { name: 'alpha', hash: null }
  })
}

beforeEach(() => {
  db = migratedMemoryDb()
  const root = new SqliteLibraryRootRepository(db).add('/lib', 1)
  const directories = new SqliteDirectoryRepository(db)
  const folderA = directories.ensure(root.id, 'a')
  folderB = directories.ensure(root.id, 'b')
  const images = new SqliteImageRepository(db)
  const versions = new SqliteImageVersionCheck(db)
  const generations = new SqliteGenerationRepository(db, new SqliteModelCatalog(db), versions)
  for (const [key, stored] of Object.entries(LIBRARY)) {
    const n = Number(key)
    const [version] = images.upsertMany(
      [
        {
          directoryId: n <= 3 ? folderA : folderB,
          fileName: `${n}.png`,
          format: ImageFormat.Png,
          sizeBytes: 1,
          mtimeMs: 1,
          width: 10,
          height: 10,
          createdAt: n
        }
      ],
      1
    )
    if (!version) throw new Error('no version')
    ids.set(n, version.id)
    generations.replace(version, stored)
  }
  reader = new SqliteGalleryReader(db, createSearchFilters())
})

const modelId = (kind: string, name: string): number =>
  db
    .prepare('SELECT id FROM models WHERE kind = ? AND display_name = ?')
    .pluck()
    .get(kind, name) as number

/** The fixture numbers (1–6) the query returns, in display order. */
function search(filters: SearchFilters, query: Partial<GalleryQuery> = {}): number[] {
  const layout = reader.layout({
    scope: { kind: GalleryScopeKind.All },
    sort: SortOrder.Oldest,
    filters,
    ...query
  })
  const byId = new Map([...ids].map(([n, id]) => [id as number, n]))
  const found: number[] = []
  for (let index = 0; index < layout.length; index += 3)
    found.push(byId.get(layout[index] ?? 0) ?? 0)
  return found
}

const loras = (
  names: string[],
  mode: SetMatchMode,
  bounds: { minWeight?: number; maxWeight?: number } = {}
): SearchFilters => ({
  loras: { ids: names.map((name) => modelId('lora', name)), mode, ...bounds }
})

describe('search filters', () => {
  it('matches a checkpoint as the model or the refiner', () => {
    expect(search({ checkpointIds: [modelId('checkpoint', 'alpha')] })).toEqual([1, 2, 6])
    expect(search({ checkpointIds: [modelId('checkpoint', 'beta')] })).toEqual([3, 4, 6])
  })

  it('matches LoRAs by any or all', () => {
    expect(search(loras(['detail'], SetMatchMode.Any))).toEqual([1, 2])
    expect(search(loras(['detail', 'style'], SetMatchMode.Any))).toEqual([1, 2, 3])
    expect(search(loras(['detail', 'style'], SetMatchMode.All))).toEqual([1])
  })

  it('applies a weight range to the matching LoRAs, keeping unknown weights only without one', () => {
    expect(search(loras(['detail'], SetMatchMode.Any, { minWeight: 0.5 }))).toEqual([1])
    expect(search(loras(['detail'], SetMatchMode.Any, { maxWeight: 0.5 }))).toEqual([2])
    expect(search(loras(['style'], SetMatchMode.Any))).toEqual([1, 3])
    expect(search(loras(['style'], SetMatchMode.Any, { minWeight: 0 }))).toEqual([1])
    expect(search(loras(['detail', 'style'], SetMatchMode.All, { minWeight: 0.5 }))).toEqual([1])
  })

  it('matches keywords by scope, phrase, prefix, exclusion and diacritics', () => {
    const keywords = (query: string, scope = KeywordScope.Positive): SearchFilters => ({
      keywords: { query, scope }
    })
    expect(search(keywords('red'))).toEqual([1, 2, 4])
    expect(search(keywords('red', KeywordScope.Negative))).toEqual([3])
    expect(search(keywords('red', KeywordScope.Both))).toEqual([1, 2, 3, 4])
    expect(search(keywords('"red hair"'))).toEqual([1, 4])
    expect(search(keywords('cyber*'))).toEqual([1, 4])
    expect(search(keywords('red -car'))).toEqual([1, 4])
    expect(search(keywords('-red'))).toEqual([3, 5, 6])
    expect(search(keywords('-car -sky'))).toEqual([1, 4, 5, 6])
    expect(search(keywords('cafe'))).toEqual([6])
    expect(search(keywords('  ( ) " '))).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('matches generator, seed, same prompt and metadata presence', () => {
    expect(search({ generators: [GeneratorKind.Fooocus] })).toEqual([2, 3])
    expect(search({ seed: '1' })).toEqual([1, 3])
    expect(search({ samePromptAs: ids.get(1) ?? 0 })).toEqual([1, 4])
    expect(search({ samePromptAs: ids.get(5) ?? 0 })).toEqual([])
    expect(search({ hasMetadata: false })).toEqual([5])
    expect(search({ hasMetadata: true })).toEqual([1, 2, 3, 4, 6])
  })

  it('combines filters with each other, a folder scope and every sort', () => {
    const combined: SearchFilters = {
      checkpointIds: [modelId('checkpoint', 'alpha')],
      keywords: { query: 'red', scope: KeywordScope.Positive },
      ...loras(['detail'], SetMatchMode.Any)
    }
    expect(search(combined)).toEqual([1, 2])
    expect(search(combined, { sort: SortOrder.Newest })).toEqual([2, 1])
    for (const sort of Object.values(SortOrder)) {
      expect(search(combined, { sort }).sort()).toEqual([1, 2])
    }
    const inFolderB = {
      scope: { kind: GalleryScopeKind.Directory, directoryId: folderB, recursive: false }
    } as const
    expect(search({ keywords: { query: 'red', scope: KeywordScope.Positive } }, inFolderB)).toEqual(
      [4]
    )
    const recursive = {
      scope: { kind: GalleryScopeKind.Directory, directoryId: folderB, recursive: true }
    } as const
    expect(search({ seed: '3' }, recursive)).toEqual([4])
  })

  it('binds values as parameters, so the statement text never depends on them', () => {
    const alpha = modelId('checkpoint', 'alpha')
    const beta = modelId('checkpoint', 'beta')
    const prepare = vi.spyOn(db, 'prepare')
    search({
      checkpointIds: [alpha],
      seed: "1' OR 1=1 --",
      keywords: { query: "girl's -car", scope: KeywordScope.Positive }
    })
    search({
      checkpointIds: [beta, 999],
      seed: '2',
      keywords: { query: 'sky -road', scope: KeywordScope.Positive }
    })
    expect(prepare).toHaveBeenCalledTimes(1)
    const sql = String(prepare.mock.calls[0]?.[0])
    expect(sql).not.toContain('OR 1=1')
    expect(search({ seed: "1' OR 1=1 --" })).toEqual([])
  })
})

describe('searchFiltersSchema', () => {
  const query = (filters: unknown): boolean =>
    galleryQuerySchema.safeParse({ scope: { kind: 'all' }, sort: 'newest', filters }).success

  it('accepts valid filters and rejects malformed ones', () => {
    expect(query({ loras: { ids: [1, 2], mode: 'all', minWeight: 0.5 } })).toBe(true)
    expect(query({ loras: { ids: [], mode: 'all' } })).toBe(false)
    expect(query({ loras: { ids: [1], mode: 'most' } })).toBe(false)
    expect(query({ loras: { ids: [1], mode: 'any', minWeight: 1, maxWeight: 0.5 } })).toBe(false)
    expect(query({ loras: { ids: [1], mode: 'any', minWeight: 0.5, maxWeight: 0.5 } })).toBe(true)
    expect(query({ checkpointIds: [0] })).toBe(false)
    expect(query({ keywords: { query: 'x'.repeat(1001), scope: 'both' } })).toBe(false)
    expect(query({ generators: ['comfy'] })).toBe(false)
    expect(query({ unknown: true })).toBe(false)
  })
})
