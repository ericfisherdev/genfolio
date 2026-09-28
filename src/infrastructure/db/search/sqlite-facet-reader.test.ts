import { beforeEach, describe, expect, it } from 'vitest'
import type { ImageId } from '@domain/library'
import { GalleryScopeKind, SortOrder, type GalleryQuery } from '@shared/gallery'
import { GeneratorKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { KeywordScope, SetMatchMode, type SearchFilters } from '@shared/search'
import { SqliteGenerationRepository } from '../repositories/sqlite-generation-repository'
import { SqliteImageVersionCheck } from '../repositories/sqlite-image-version-check'
import { SqliteModelCatalog } from '../repositories/sqlite-model-catalog'
import { SqliteTagRepository } from '../repositories/sqlite-tag-repository'
import { searchLibrary, type SearchLibrary } from '../testing/search-library'
import { createImageSelector } from './create-image-selector'
import { SqliteFacetReader } from './sqlite-facet-reader'

let library: SearchLibrary
let reader: SqliteFacetReader

beforeEach(() => {
  library = searchLibrary()
  reader = new SqliteFacetReader(library.db, createImageSelector(library.db))
})

const query = (filters?: SearchFilters, scope?: GalleryQuery['scope']): GalleryQuery => ({
  scope: scope ?? { kind: GalleryScopeKind.All },
  sort: SortOrder.Newest,
  ...(filters ? { filters } : {})
})

const named = (values: readonly { name: string; count: number }[]): [string, number][] =>
  values.map((value) => [value.name, value.count])

describe('SqliteFacetReader', () => {
  it('counts every value over All Photos', () => {
    const facets = reader.facets(query())
    expect(named(facets.checkpoints)).toEqual([
      ['alpha', 3],
      ['beta', 3]
    ])
    expect(named(facets.loras)).toEqual([
      ['detail', 2],
      ['style', 2]
    ])
    expect(facets.generators).toEqual([
      { kind: GeneratorKind.A1111, count: 3 },
      { kind: GeneratorKind.Fooocus, count: 2 }
    ])
    expect(facets.withoutMetadata).toBe(1)
    expect(facets.checkpoints[0]?.id).toBe(library.modelId('checkpoint', 'alpha'))
  })

  it('counts a folder holding the whole library exactly as All Photos', () => {
    const rootFolder = library.db
      .prepare("SELECT id FROM directories WHERE rel_path = ''")
      .pluck()
      .get() as number
    const everything = reader.facets(query())
    expect(
      reader.facets(
        query(undefined, {
          kind: GalleryScopeKind.Directory,
          directoryId: rootFolder,
          recursive: true
        })
      )
    ).toEqual(everything)
    // Not recursive, the root folder itself holds no images.
    const flat = reader.facets(
      query(undefined, {
        kind: GalleryScopeKind.Directory,
        directoryId: rootFolder,
        recursive: false
      })
    )
    expect(flat).toEqual({
      checkpoints: [],
      loras: [],
      tags: [],
      generators: [],
      withoutMetadata: 0
    })
  })

  it('counts within a folder', () => {
    const facets = reader.facets(
      query(undefined, {
        kind: GalleryScopeKind.Directory,
        directoryId: library.folderB,
        recursive: false
      })
    )
    expect(named(facets.checkpoints)).toEqual([
      ['beta', 2],
      ['alpha', 1]
    ])
    expect(facets.loras).toEqual([])
    expect(facets.generators).toEqual([{ kind: GeneratorKind.A1111, count: 2 }])
    expect(facets.withoutMetadata).toBe(1)
  })

  it('ignores a facet’s own selection but applies the other filters', () => {
    const alpha = library.modelId('checkpoint', 'alpha')
    const facets = reader.facets(query({ checkpointIds: [alpha] }))
    expect(named(facets.checkpoints)).toEqual([
      ['alpha', 3],
      ['beta', 3]
    ])
    expect(named(facets.loras)).toEqual([
      ['detail', 2],
      ['style', 1]
    ])
    expect(facets.generators).toEqual([
      { kind: GeneratorKind.A1111, count: 2 },
      { kind: GeneratorKind.Fooocus, count: 1 }
    ])
    expect(facets.withoutMetadata).toBe(0)

    const byLora = reader.facets(
      query({ loras: { ids: [library.modelId('lora', 'style')], mode: SetMatchMode.Any } })
    )
    expect(named(byLora.loras)).toEqual([
      ['detail', 2],
      ['style', 2]
    ])
    expect(named(byLora.checkpoints)).toEqual([
      ['alpha', 1],
      ['beta', 1]
    ])
  })

  it('counts LoRAs in All mode as what adding each would leave, within the weight bounds', () => {
    const detail = library.modelId('lora', 'detail')
    const allWithDetail = reader.facets(query({ loras: { ids: [detail], mode: SetMatchMode.All } }))
    expect(named(allWithDetail.loras)).toEqual([
      ['detail', 2],
      ['style', 1]
    ])
    const heavy = reader.facets(
      query({ loras: { ids: [detail], mode: SetMatchMode.Any, minWeight: 0.5 } })
    )
    expect(named(heavy.loras)).toEqual([
      ['detail', 1],
      ['style', 1]
    ])
  })

  it('ignores its own generator and metadata selections', () => {
    const byGenerator = reader.facets(query({ generators: [GeneratorKind.Fooocus] }))
    expect(byGenerator.generators).toEqual([
      { kind: GeneratorKind.A1111, count: 3 },
      { kind: GeneratorKind.Fooocus, count: 2 }
    ])
    expect(named(byGenerator.checkpoints)).toEqual([
      ['alpha', 1],
      ['beta', 1]
    ])
    expect(reader.facets(query({ hasMetadata: true })).withoutMetadata).toBe(1)
  })

  it('applies keywords and a recursive folder scope to the counts', () => {
    const red = reader.facets(query({ keywords: { query: 'red', scope: KeywordScope.Positive } }))
    expect(named(red.checkpoints)).toEqual([
      ['alpha', 2],
      ['beta', 1]
    ])
    expect(named(red.loras)).toEqual([
      ['detail', 2],
      ['style', 1]
    ])
    const inB = reader.facets(
      query(
        { keywords: { query: 'red', scope: KeywordScope.Positive } },
        { kind: GalleryScopeKind.Directory, directoryId: library.folderB, recursive: true }
      )
    )
    expect(named(inB.checkpoints)).toEqual([['beta', 1]])
  })

  it('counts an image once when its checkpoint is also its refiner', () => {
    const versions = new SqliteImageVersionCheck(library.db)
    const generations = new SqliteGenerationRepository(
      library.db,
      new SqliteModelCatalog(library.db),
      versions
    )
    const image = library.ids.get(4) ?? 0
    generations.replace(
      { id: image as never, sizeBytes: 1, mtimeMs: 1 },
      {
        generator: GeneratorKind.A1111,
        origin: MetadataOrigin.PngText,
        params: {},
        checkpoint: { name: 'beta', hash: null },
        refiner: { name: 'beta', hash: null }
      }
    )
    expect(named(reader.facets(query()).checkpoints)).toEqual([
      ['alpha', 3],
      ['beta', 3]
    ])
  })

  it('counts tags, ignoring its own Any selection but keeping All and exclusions', () => {
    const repository = new SqliteTagRepository(library.db)
    const red = repository.create('red', 1).id
    const blue = repository.create('blue', 1).id
    const image = (n: number): ImageId => library.ids.get(n) ?? (0 as ImageId)
    repository.apply([red], [image(1), image(2), image(3)])
    repository.apply([blue], [image(2), image(4)])
    expect(named(reader.facets(query()).tags)).toEqual([
      ['red', 3],
      ['blue', 2]
    ])
    expect(
      named(reader.facets(query({ tags: { ids: [blue], mode: SetMatchMode.Any } })).tags)
    ).toEqual([
      ['red', 3],
      ['blue', 2]
    ])
    expect(
      named(reader.facets(query({ tags: { ids: [blue], mode: SetMatchMode.All } })).tags)
    ).toEqual([
      ['blue', 2],
      ['red', 1]
    ])
    expect(
      named(reader.facets(query({ tags: { mode: SetMatchMode.Any, excludeIds: [blue] } })).tags)
    ).toEqual([['red', 2]])
  })
})

describe('SqliteFacetReader over most of the library', () => {
  it('counts the library minus the left-out images exactly as it counts directly', () => {
    const tags = new SqliteTagRepository(library.db)
    const red = tags.create('red', 1)
    const blue = tags.create('blue', 1)
    const image = (n: number): ImageId => library.ids.get(n) ?? (0 as ImageId)
    tags.apply([red.id], [image(1), image(2), image(4)])
    tags.apply([blue.id], [image(2), image(6)])
    const direct = new SqliteFacetReader(
      library.db,
      createImageSelector(library.db),
      Number.POSITIVE_INFINITY
    )
    const byComplement = new SqliteFacetReader(library.db, createImageSelector(library.db), 0)
    const queries: GalleryQuery[] = [
      query({ keywords: { query: '-blue', scope: KeywordScope.Positive } }),
      query({ tags: { mode: SetMatchMode.Any, excludeIds: [blue.id] } }),
      query({ loras: { ids: [library.modelId('lora', 'detail')], mode: SetMatchMode.Any } }),
      query({ hasMetadata: true, generators: [GeneratorKind.A1111] }),
      query(
        { seed: '1' },
        { kind: GalleryScopeKind.Directory, directoryId: library.folderA, recursive: true }
      )
    ]
    for (const each of queries) expect(byComplement.facets(each)).toEqual(direct.facets(each))
  })
})
