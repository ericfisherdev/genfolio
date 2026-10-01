import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryId, ImageId } from '@domain/library'
import { galleryQuerySchema, GalleryScopeKind, SortOrder, type GalleryQuery } from '@shared/gallery'
import { GeneratorKind } from '@shared/generation-kinds'
import { KeywordScope, SetMatchMode, type SearchFilters } from '@shared/search'
import { SqliteAlbumRepository } from '../repositories/sqlite-album-repository'
import { SqliteImageMarkRepository } from '../repositories/sqlite-image-mark-repository'
import { SqliteTagRepository } from '../repositories/sqlite-tag-repository'
import { SqliteGalleryReader } from '../sqlite-gallery-reader'
import { searchLibrary, type SearchLibrary } from '../testing/search-library'
import { createImageSelector } from './create-image-selector'

let db: Database.Database
let reader: SqliteGalleryReader
let folderB: DirectoryId
let ids: ReadonlyMap<number, ImageId>
let modelId: SearchLibrary['modelId']

beforeEach(() => {
  const library = searchLibrary()
  ;({ db, ids, folderB, modelId } = library)
  reader = new SqliteGalleryReader(db, createImageSelector(db))
})

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

describe('favourites and ratings', () => {
  function mark(favorites: number[], ratings: Record<number, number>): void {
    const marks = new SqliteImageMarkRepository(db)
    marks.setFavorite(
      favorites.map((n) => ids.get(n) ?? (0 as ImageId)),
      true
    )
    for (const [n, rating] of Object.entries(ratings)) {
      marks.setRating([ids.get(Number(n)) ?? (0 as ImageId)], rating)
    }
  }

  it('sets marks on existing images only and reports how many', () => {
    const marks = new SqliteImageMarkRepository(db)
    const one = ids.get(1) ?? (0 as ImageId)
    expect(marks.setFavorite([one, 999_999 as ImageId], true)).toBe(1)
    expect(marks.setRating([one], 4)).toBe(1)
    expect(marks.setRating([one], 0)).toBe(1)
  })

  it('filters favourites and a minimum rating, alone and with other filters', () => {
    mark([2, 5], { 1: 5, 2: 3, 4: 1 })
    expect(search({ favoritesOnly: true })).toEqual([2, 5])
    expect(search({ minRating: 3 })).toEqual([1, 2])
    expect(search({ minRating: 3, favoritesOnly: true })).toEqual([2])
    expect(
      search({ minRating: 1, keywords: { query: 'red', scope: KeywordScope.Positive } })
    ).toEqual([1, 2, 4])
  })

  it('sorts by rating, then newest', () => {
    mark([], { 1: 5, 2: 3, 4: 3 })
    expect(search({}, { sort: SortOrder.Rating })).toEqual([1, 4, 2, 6, 5, 3])
  })
})

describe('tags', () => {
  function tagged(): { red: number; blue: number } {
    const repository = new SqliteTagRepository(db)
    const red = repository.create('red', 1).id
    const blue = repository.create('blue', 1).id
    const image = (n: number): ImageId => ids.get(n) ?? (0 as ImageId)
    repository.apply([red], [image(1), image(2), image(3)])
    repository.apply([blue], [image(2), image(4)])
    return { red, blue }
  }

  it('matches any or all included tags and leaves out excluded ones', () => {
    const { red, blue } = tagged()
    expect(search({ tags: { ids: [red, blue], mode: SetMatchMode.Any } })).toEqual([1, 2, 3, 4])
    expect(search({ tags: { ids: [red, blue], mode: SetMatchMode.All } })).toEqual([2])
    expect(search({ tags: { mode: SetMatchMode.Any, excludeIds: [red] } })).toEqual([4, 5, 6])
    expect(search({ tags: { ids: [red], mode: SetMatchMode.Any, excludeIds: [blue] } })).toEqual([
      1, 3
    ])
    expect(
      search({
        tags: { ids: [red], mode: SetMatchMode.Any },
        keywords: { query: 'red', scope: KeywordScope.Positive }
      })
    ).toEqual([1, 2])
  })
})

describe('untagged and unalbumed', () => {
  const image = (n: number): ImageId => ids.get(n) ?? (0 as ImageId)

  it('finds images carrying no tag, alone and with other filters', () => {
    const repository = new SqliteTagRepository(db)
    const red = repository.create('red', 1).id
    repository.apply([red], [image(1), image(2), image(3)])
    expect(search({ untagged: true })).toEqual([4, 5, 6])
    expect(
      search({ untagged: true, keywords: { query: 'red', scope: KeywordScope.Positive } })
    ).toEqual([4])
  })

  it('finds images in no manual album', () => {
    const albums = new SqliteAlbumRepository(db)
    const keepers = albums.create('keepers', 1).id
    albums.add(keepers, [image(2), image(5)])
    expect(search({ unalbumed: true })).toEqual([1, 3, 4, 6])
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
    expect(query({ favoritesOnly: false })).toBe(false)
    expect(query({ tags: { mode: 'any' } })).toBe(false)
    expect(query({ tags: { ids: [], mode: 'any' } })).toBe(false)
    expect(query({ tags: { mode: 'all', excludeIds: [3] } })).toBe(true)
    expect(query({ minRating: 6 })).toBe(false)
    expect(query({ minRating: 0 })).toBe(false)
    expect(query({ favoritesOnly: true, minRating: 5 })).toBe(true)
    expect(query({ unknown: true })).toBe(false)
  })
})
