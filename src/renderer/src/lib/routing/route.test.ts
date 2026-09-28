import { describe, expect, it } from 'vitest'
import { GeneratorKind } from '@shared/generation-kinds'
import { KeywordScope, SetMatchMode } from '@shared/search-kinds'
import type { SearchFilters } from '@shared/search'
import { ALL_PHOTOS, formatRoute, parseRoute, RouteKind, withFilters, type Route } from './route'

describe('routes', () => {
  it.each<Route>([
    ALL_PHOTOS,
    { kind: RouteKind.Directory, directoryId: 7, recursive: true },
    { kind: RouteKind.Directory, directoryId: 7, recursive: false },
    { kind: RouteKind.Album, albumId: 3 },
    { kind: RouteKind.Album, albumId: 3, filters: { favoritesOnly: true } },
    { kind: RouteKind.Image, imageId: 42 },
    { kind: RouteKind.Slideshow },
    { kind: RouteKind.Slideshow, startId: 7 }
  ])('round-trips %j', (route) => {
    expect(parseRoute(formatRoute(route))).toEqual(route)
  })

  it('defaults a directory route without the flag to recursive', () => {
    expect(parseRoute('#/dir/3')).toEqual({
      kind: RouteKind.Directory,
      directoryId: 3,
      recursive: true
    })
  })

  it('ignores a slideshow start that is not an image id', () => {
    expect(parseRoute('#/slideshow?start=abc')).toEqual({ kind: RouteKind.Slideshow })
  })

  it('keeps an album when its filters are cleared', () => {
    expect(
      withFilters({ kind: RouteKind.Album, albumId: 3, filters: { minRating: 2 } }, {})
    ).toEqual({ kind: RouteKind.Album, albumId: 3 })
  })

  it.each([
    '',
    '#',
    '#/dir/0',
    '#/album/0',
    '#/album/x',
    '#/dir/abc',
    '#/image/-1',
    '#/dir/3?recursive=2',
    '#/nowhere'
  ])('falls back to All Photos for %s', (hash) => {
    expect(parseRoute(hash)).toEqual(ALL_PHOTOS)
  })
})

describe('routes with filters', () => {
  const filters: SearchFilters = {
    checkpointIds: [4, 9],
    loras: { ids: [2, 5], mode: SetMatchMode.All, minWeight: 0.5, maxWeight: 1 },
    keywords: { query: 'red hair, "studio lighting" -blurry', scope: KeywordScope.Both },
    generators: [GeneratorKind.Fooocus],
    seed: '42',
    samePromptAs: 7,
    hasMetadata: true,
    favoritesOnly: true,
    minRating: 3,
    tags: { ids: [8, 9], mode: SetMatchMode.All, excludeIds: [10] }
  }

  it.each<Route>([
    { kind: RouteKind.All, filters },
    { kind: RouteKind.Directory, directoryId: 3, recursive: false, filters },
    {
      kind: RouteKind.All,
      filters: { keywords: { query: 'café 桜', scope: KeywordScope.Positive } }
    },
    { kind: RouteKind.All, filters: { loras: { ids: [1], mode: SetMatchMode.Any } } }
  ])('round-trips %j', (route) => {
    expect(parseRoute(formatRoute(route))).toEqual(route)
  })

  it('writes equal filters as equal text', () => {
    expect(formatRoute({ kind: RouteKind.All, filters: { seed: '1', checkpointIds: [2] } })).toBe(
      formatRoute({ kind: RouteKind.All, filters: { checkpointIds: [2], seed: '1' } })
    )
  })

  it('drops invalid filter parameters but keeps the rest of the route', () => {
    expect(
      parseRoute('#/dir/3?recursive=1&ckpt=0,abc&lora=&gen=comfy&meta=2&same=-1&seed=1')
    ).toEqual({
      kind: RouteKind.Directory,
      directoryId: 3,
      recursive: true,
      filters: { seed: '1' }
    })
    expect(parseRoute('#/?q=%20%20&lmode=all')).toEqual(ALL_PHOTOS)
    expect(parseRoute('#/?lora=1&lmin=1&lmax=0.5')).toEqual({
      kind: RouteKind.All,
      filters: { loras: { ids: [1], mode: SetMatchMode.Any } }
    })
    expect(parseRoute(`#/?seed=${'9'.repeat(41)}`)).toEqual(ALL_PHOTOS)
  })

  it('replaces or clears filters on a gallery route', () => {
    const route = { kind: RouteKind.Directory, directoryId: 3, recursive: true } as const
    expect(withFilters(route, { seed: '1' })).toEqual({ ...route, filters: { seed: '1' } })
    expect(withFilters({ ...route, filters: { seed: '1' } }, {})).toEqual(route)
    expect(withFilters({ kind: RouteKind.All, filters: { seed: '1' } }, undefined)).toEqual(
      ALL_PHOTOS
    )
  })
})
