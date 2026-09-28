import { beforeEach, describe, expect, it } from 'vitest'
import { GalleryScopeKind, SortOrder, type GalleryQuery } from '@shared/gallery'
import { GeneratorKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { KeywordScope, SetMatchMode, type SearchFilters } from '@shared/search'
import { SqliteGenerationRepository } from '../repositories/sqlite-generation-repository'
import { SqliteImageVersionCheck } from '../repositories/sqlite-image-version-check'
import { SqliteModelCatalog } from '../repositories/sqlite-model-catalog'
import { searchLibrary, type SearchLibrary } from '../testing/search-library'
import { createSearchFilters } from './filters'
import { SqliteFacetReader } from './sqlite-facet-reader'

let library: SearchLibrary
let reader: SqliteFacetReader

beforeEach(() => {
  library = searchLibrary()
  reader = new SqliteFacetReader(library.db, createSearchFilters())
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
})
