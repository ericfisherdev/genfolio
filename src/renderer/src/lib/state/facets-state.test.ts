import { describe, expect, it, vi } from 'vitest'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import type { SearchFacets } from '@shared/search'
import { FacetsState } from './facets.svelte'

const query = { scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Newest } as const
const facets = (withoutMetadata: number): SearchFacets => ({
  checkpoints: [],
  loras: [],
  tags: [],
  generators: [],
  withoutMetadata
})

describe('FacetsState', () => {
  it('keeps the newest response when an older one finishes last', async () => {
    let resolveFirst: (value: SearchFacets) => void = () => undefined
    const getFacets = vi
      .fn()
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(facets(2))
    const state = new FacetsState({ getFacets })
    const first = state.load(query)
    await state.load(query)
    resolveFirst(facets(1))
    await first
    expect(state.facets?.withoutMetadata).toBe(2)
  })

  it('keeps the last facets and reports a failure', async () => {
    const getFacets = vi
      .fn()
      .mockResolvedValueOnce(facets(3))
      .mockRejectedValueOnce(new Error('down'))
    const state = new FacetsState({ getFacets })
    await state.load(query)
    await state.load(query)
    expect(state.facets?.withoutMetadata).toBe(3)
    expect(state.loadError).toBe('down')
  })
})
