import { describe, expect, it, vi } from 'vitest'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import { RouteKind } from '../routing/route'
import { GalleryState } from '../state/gallery.svelte'
import { cardHeight, gridGeometry } from './grid-geometry'
import { queryForRoute, queryKey } from './gallery-query'

describe('gridGeometry', () => {
  it('fits as many ~320 px columns as the width allows, filling it exactly', () => {
    expect(gridGeometry(1000)).toEqual({ lanes: 3, columnWidth: (1000 - 24) / 3 })
    expect(gridGeometry(300)).toEqual({ lanes: 1, columnWidth: 300 })
    expect(gridGeometry(0).lanes).toBe(1)
  })

  it('keeps the aspect ratio for card heights', () => {
    expect(cardHeight(320, 832, 1216)).toBe(468)
    expect(cardHeight(320, 1024, 1024)).toBe(320)
  })
})

describe('queryForRoute', () => {
  const sorts = { current: SortOrder.Oldest, album: SortOrder.AlbumOrder }
  const never = (): boolean => false

  it('maps routes to queries and keeps the previous one for image routes', () => {
    const all = queryForRoute({ kind: RouteKind.All }, sorts, undefined, never)
    expect(all).toEqual({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Oldest })
    const dir = queryForRoute(
      { kind: RouteKind.Directory, directoryId: 5, recursive: false },
      sorts,
      all,
      never
    )
    expect(dir && queryKey(dir)).toBe('dir:5:0|oldest')
    expect(queryForRoute({ kind: RouteKind.Image, imageId: 1 }, sorts, dir, never)).toBe(dir)
  })

  it('sorts an album by the album preference', () => {
    const album = queryForRoute(
      { kind: RouteKind.Album, albumId: 3, filters: { favoritesOnly: true } },
      sorts,
      undefined,
      never
    )
    expect(album).toEqual({
      scope: { kind: GalleryScopeKind.Album, albumId: 3 },
      sort: SortOrder.AlbumOrder,
      filters: { favoritesOnly: true }
    })
    expect(album && queryKey(album)).toMatch(/^album:3\|album-order\|/)
  })

  it('sorts a smart album like the library', () => {
    const smart = queryForRoute({ kind: RouteKind.Album, albumId: 3 }, sorts, undefined, () => true)
    expect(smart?.sort).toBe(SortOrder.Oldest)
  })
})

describe('GalleryState', () => {
  const layout = new Int32Array([7, 832, 1216, 8, 1024, 1024])

  it('exposes ids and sizes and finds indexes', async () => {
    const gallery = new GalleryState({
      getImageLayout: async () => layout,
      getImages: async () => []
    })
    await gallery.load({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Newest })
    expect(gallery.count).toBe(2)
    expect(gallery.idAt(1)).toBe(8)
    expect(gallery.sizeAt(0)).toEqual({ width: 832, height: 1216 })
    expect(gallery.indexOf(8)).toBe(1)
    expect(gallery.indexOf(99)).toBe(-1)
  })

  it('ignores a layout that arrives after a newer query', async () => {
    let releaseOld: (value: Int32Array) => void = () => undefined
    const getImageLayout = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (releaseOld = resolve)))
      .mockImplementationOnce(async () => layout)
    const gallery = new GalleryState({ getImageLayout, getImages: async () => [] })
    const old = gallery.load({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Newest })
    await gallery.load({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Oldest })
    releaseOld(new Int32Array(0))
    await old
    expect(gallery.count).toBe(2)
  })

  it('fetches each card once, in batches of at most 500', async () => {
    const getImages = vi.fn(async (ids: readonly number[]) => ids.map((id) => ({ id }) as never))
    const gallery = new GalleryState({ getImageLayout: async () => layout, getImages })
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1)
    await gallery.ensureCards(ids)
    await gallery.ensureCards(ids.slice(0, 10))
    expect(getImages.mock.calls.map(([batch]) => batch.length)).toEqual([500, 500, 200])
    expect(gallery.card(1)).toEqual({ id: 1 })
  })

  it('remembers scroll per query', async () => {
    const gallery = new GalleryState({
      getImageLayout: async () => layout,
      getImages: async () => []
    })
    await gallery.load({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Newest })
    gallery.rememberScroll(420)
    await gallery.load({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Oldest })
    expect(gallery.savedScroll()).toBe(0)
    await gallery.load({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Newest })
    expect(gallery.savedScroll()).toBe(420)
  })

  it('records a failed layout instead of rejecting', async () => {
    const gallery = new GalleryState({
      getImageLayout: () => Promise.reject(new Error('timed out')),
      getImages: async () => []
    })
    await expect(
      gallery.load({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Newest })
    ).resolves.toBeUndefined()
    expect(gallery.loadError).toBe('timed out')
    expect(gallery.loading).toBe(false)
  })

  it('asks again for cards whose fetch failed', async () => {
    const getImages = vi
      .fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockImplementation(async (ids: readonly number[]) => ids.map((id) => ({ id }) as never))
    const gallery = new GalleryState({ getImageLayout: async () => layout, getImages })
    await expect(gallery.ensureCards([1, 2])).resolves.toBeUndefined()
    expect(gallery.card(1)).toBeUndefined()
    await gallery.ensureCards([1, 2])
    expect(gallery.card(1)).toEqual({ id: 1 })
  })

  it('drops cards that arrive after a reload and fetches them again', async () => {
    let release: (cards: never[]) => void = () => undefined
    const getImages = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      .mockImplementation(async (ids: readonly number[]) =>
        ids.map((id) => ({ id, fresh: true }) as never)
      )
    const gallery = new GalleryState({ getImageLayout: async () => layout, getImages })
    const pending = gallery.ensureCards([1])
    await gallery.reload()
    release([{ id: 1, fresh: false } as never])
    await pending
    expect(gallery.card(1)).toBeUndefined()
    await gallery.ensureCards([1])
    expect(gallery.card(1)).toEqual({ id: 1, fresh: true })
  })
})
