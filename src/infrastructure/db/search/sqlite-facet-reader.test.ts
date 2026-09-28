import { beforeEach, describe, expect, it } from 'vitest'
import { GalleryScopeKind, SortOrder, type GalleryQuery } from '@shared/gallery'
import { GeneratorKind } from '@shared/generation-kinds'
import { SetMatchMode, type SearchFilters } from '@shared/search'
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
})
