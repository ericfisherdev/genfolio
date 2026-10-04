import { describe, expect, it, vi } from 'vitest'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import type { ImageCard } from '@shared/gallery'
import { ImageFormat } from '@shared/image-format'
import { RouteKind } from '../routing/route'
import { GalleryState, MAX_CACHED_CARDS } from '../state/gallery.svelte'
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

  it('keeps at most 2000 cards, dropping the longest-held ones that are off screen', async () => {
    const getImages = vi.fn(async (ids: readonly number[]) => ids.map((id) => ({ id }) as never))
    const gallery = new GalleryState({ getImageLayout: async () => layout, getImages })
    const ids = (from: number, count: number): number[] =>
      Array.from({ length: count }, (_, i) => from + i)
    await gallery.ensureCards(ids(1, MAX_CACHED_CARDS))
    await gallery.ensureCards([1, ...ids(MAX_CACHED_CARDS + 1, 10)])
    expect(gallery.card(1)).toEqual({ id: 1 })
    expect(gallery.card(2)).toBeUndefined()
    expect(gallery.card(12)).toEqual({ id: 12 })
    expect(gallery.card(MAX_CACHED_CARDS + 10)).toEqual({ id: MAX_CACHED_CARDS + 10 })
    await gallery.ensureCards([2])
    expect(getImages).toHaveBeenLastCalledWith([2])
  })

  it('evicts against what is on screen now, not where a slow fetch started', async () => {
    let release: () => void = () => undefined
    // Fetches past the budget are held until released; the rest answer at once.
    const getImages = vi.fn(async (ids: readonly number[]) => {
      if ((ids[0] ?? 0) > MAX_CACHED_CARDS)
        await new Promise<void>((resolve) => (release = resolve))
      return ids.map((id) => ({ id }) as never)
    })
    const gallery = new GalleryState({ getImageLayout: async () => layout, getImages })
    const ids = (from: number, count: number): number[] =>
      Array.from({ length: count }, (_, i) => from + i)
    await gallery.ensureCards(ids(1, MAX_CACHED_CARDS))
    const slow = gallery.ensureCards(ids(MAX_CACHED_CARDS + 1, 10))
    // Back to the top: these are cached already, so nothing is fetched.
    await gallery.ensureCards(ids(1, 10))
    release()
    await slow
    for (const id of ids(1, 10)) expect(gallery.card(id)).toEqual({ id })
    expect(gallery.card(11)).toBeUndefined()
  })

  it('keeps marks patched while a refetch was in flight, and lets a later fetch replace them', async () => {
    const dbCard = (id: number, favorite: boolean): ImageCard => ({
      id,
      rootId: 1,
      directoryId: 1,
      fileName: `${id}.png`,
      relDir: '',
      format: ImageFormat.Png,
      width: 1,
      height: 1,
      sizeBytes: 1,
      createdAt: 1,
      addedAt: 1,
      favorite,
      rating: 0,
      similarGroupId: null,
      similarCount: 0
    })
    let favoriteInDb = false
    let release: () => void = () => undefined
    let hold = false
    const getImages = vi.fn(async (ids: readonly number[]) => {
      if (hold) await new Promise<void>((resolve) => (release = resolve))
      return ids.map((id) => dbCard(id, favoriteInDb))
    })
    const gallery = new GalleryState({ getImageLayout: async () => layout, getImages })
    await gallery.ensureCards([7])
    // A refresh starts a refetch that reads the database before the write below lands.
    hold = true
    await gallery.refresh()
    const refetch = gallery.ensureCards([7])
    gallery.patchCards([7], { favorite: true })
    favoriteInDb = true
    release()
    await refetch
    expect(gallery.card(7)?.favorite).toBe(true)
    // A fetch started after the patch reads the written value and replaces the card.
    hold = false
    await gallery.refresh()
    await gallery.ensureCards([7])
    expect(getImages).toHaveBeenCalledTimes(3)
    expect(gallery.card(7)?.favorite).toBe(true)
  })

  it('does not keep a reverted patch over a fetch that started before the revert', async () => {
    let release: () => void = () => undefined
    const getImages = vi.fn(async (ids: readonly number[]) => {
      await new Promise<void>((resolve) => (release = resolve))
      return ids.map((id) => ({ id, favorite: false, rating: 0 }) as never)
    })
    const gallery = new GalleryState({ getImageLayout: async () => layout, getImages })
    const first = gallery.ensureCards([7])
    release()
    await first
    const patch = gallery.patchCards([7], { favorite: true })
    await gallery.refresh()
    const refetch = gallery.ensureCards([7])
    patch.revert()
    release()
    await refetch
    expect(gallery.card(7)).toEqual({ id: 7, favorite: false, rating: 0 })
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

describe('GalleryState.refresh', () => {
  it('marks cards stale: the next request for them fetches fresh ones, keeping the old until then, and drops gone images', async () => {
    const cardOf = (id: number, rating: number): ImageCard => ({
      id,
      rootId: 1,
      directoryId: 1,
      fileName: `${id}.png`,
      relDir: '',
      format: ImageFormat.Png,
      width: 1,
      height: 1,
      sizeBytes: 1,
      createdAt: 1,
      addedAt: 1,
      favorite: false,
      rating,
      similarGroupId: null,
      similarCount: 0
    })
    let rating = 0
    let release: () => void = () => undefined
    const getImages = vi.fn(async (ids: readonly number[]) => {
      if (rating > 0) await new Promise<void>((resolve) => (release = resolve))
      return ids.filter((id) => id === 7).map((id) => cardOf(id, rating))
    })
    const gallery = new GalleryState({
      getImageLayout: async () => new Int32Array([7, 1, 1]),
      getImages
    })
    await gallery.load({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Newest })
    await gallery.ensureCards([7, 8])
    expect(gallery.card(8)).toBeUndefined()
    rating = 3
    const epoch = gallery.cardEpoch
    await gallery.refresh()
    expect(gallery.cardEpoch).toBe(epoch + 1)
    expect(getImages).toHaveBeenCalledTimes(1)
    const ensuring = gallery.ensureCards([7])
    await Promise.resolve()
    expect(gallery.card(7)?.rating).toBe(0)
    release()
    await ensuring
    expect(gallery.card(7)?.rating).toBe(3)
  })
})
