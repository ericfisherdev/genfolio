import { describe, expect, it, vi, type Mock } from 'vitest'
import { GalleryScopeKind, MAX_IDS_PER_MARK, SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery, ImageCard } from '@shared/gallery'
import { ImageFormat } from '@shared/image-format'
import { GalleryState } from './gallery.svelte'
import { RouteKind } from '../routing/route'
import { ImageMarks, LayoutUpdate, layoutUpdateFor } from './image-marks'

const card = (id: number): ImageCard => ({
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
  rating: 0
})

interface FakeApi {
  readonly getImageLayout: Mock<() => Promise<Int32Array>>
  readonly getImages: Mock<(ids: readonly number[]) => Promise<ImageCard[]>>
  readonly setFavorite: Mock<(ids: readonly number[], favorite: boolean) => Promise<number>>
  readonly setRating: Mock<(ids: readonly number[], rating: number) => Promise<number>>
  readonly loadFacets: Mock<(query: GalleryQuery) => Promise<void>>
}

function fakeApi(): FakeApi {
  return {
    getImageLayout: vi.fn(async () => new Int32Array([1, 1, 1, 2, 1, 1])),
    getImages: vi.fn(async (ids: readonly number[]) => ids.map(card)),
    setFavorite: vi.fn(async (ids: readonly number[]) => ids.length),
    setRating: vi.fn(async (ids: readonly number[]) => ids.length),
    loadFacets: vi.fn(async () => undefined)
  }
}

interface Harness {
  readonly api: FakeApi
  readonly gallery: GalleryState
  readonly notices: { notify: ReturnType<typeof vi.fn<(message: string) => void>> }
  readonly marks: ImageMarks
}

async function setup(
  query: GalleryQuery = { scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Newest }
): Promise<Harness> {
  const api = fakeApi()
  const gallery = new GalleryState(api)
  await gallery.load(query)
  await gallery.ensureCards([1, 2])
  const notices = { notify: vi.fn<(message: string) => void>() }
  return {
    api,
    gallery,
    notices,
    marks: new ImageMarks(api, gallery, { load: api.loadFacets }, notices)
  }
}

describe('ImageMarks', () => {
  it('updates cards at once and sends the change', async () => {
    const { api, gallery, marks } = await setup()
    const pending = marks.setFavorite([1, 2], true)
    expect(gallery.card(1)?.favorite).toBe(true)
    expect(await pending).toBe(true)
    expect(api.setFavorite).toHaveBeenCalledWith([1, 2], true)
    await marks.setRating([2], 4)
    expect(gallery.card(2)?.rating).toBe(4)
  })

  it('puts cards back and says so when the change fails', async () => {
    const { api, gallery, notices, marks } = await setup()
    api.setRating.mockRejectedValueOnce(new Error('service down'))
    expect(await marks.setRating([1, 2], 5)).toBe(false)
    expect(gallery.card(1)?.rating).toBe(0)
    expect(notices.notify).toHaveBeenCalledWith('Could not rate 2 images: service down')
  })

  it('sends large selections in chunks', async () => {
    const { api, marks } = await setup()
    const ids = Array.from({ length: MAX_IDS_PER_MARK + 5 }, (_, index) => index + 1)
    await marks.setFavorite(ids, true)
    expect(api.setFavorite.mock.calls.map(([chunk]) => chunk.length)).toEqual([MAX_IDS_PER_MARK, 5])
  })

  it('reloads the layout and facet counts only when the results depend on marks', async () => {
    const plain = await setup()
    await plain.marks.setFavorite([1], true)
    expect(plain.api.getImageLayout).toHaveBeenCalledTimes(1)
    expect(plain.api.loadFacets).not.toHaveBeenCalled()
    const favourites = await setup(FAVOURITES)
    await favourites.marks.setFavorite([1], false)
    expect(favourites.api.getImageLayout).toHaveBeenCalledTimes(2)
    expect(favourites.api.loadFacets).toHaveBeenCalledWith(FAVOURITES)
    const byRating = await setup({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Rating })
    await byRating.marks.setRating([1], 2)
    expect(byRating.api.getImageLayout).toHaveBeenCalledTimes(2)
    expect(byRating.api.loadFacets).toHaveBeenCalledTimes(1)
  })

  it('leaves the layout in place but stale when the reload is deferred', async () => {
    const { api, gallery, marks } = await setup(FAVOURITES)
    await marks.setFavorite([1], false, LayoutUpdate.Deferred)
    expect(api.getImageLayout).toHaveBeenCalledTimes(1)
    expect(api.loadFacets).not.toHaveBeenCalled()
    expect(gallery.layoutStale).toBe(true)
    await gallery.refreshLayout()
    expect(gallery.layoutStale).toBe(false)
  })

  it('keeps a later favourite when an earlier rating of the same image fails', async () => {
    const { api, gallery, marks } = await setup()
    const rating = deferred()
    api.setRating.mockReturnValueOnce(rating.promise)
    const rated = marks.setRating([1], 3)
    await marks.setFavorite([1], true)
    rating.reject(new Error('service down'))
    await rated
    expect(gallery.card(1)).toMatchObject({ favorite: true, rating: 0 })
  })

  it('keeps a later rating when an earlier one fails', async () => {
    const { api, gallery, marks } = await setup()
    const first = deferred()
    api.setRating.mockReturnValueOnce(first.promise)
    const rated = marks.setRating([1], 3)
    await marks.setRating([1], 4)
    first.reject(new Error('service down'))
    await rated
    expect(gallery.card(1)?.rating).toBe(4)
  })

  it('keeps the cards a reload fetched while the change was in flight', async () => {
    const { api, gallery, marks } = await setup()
    const rating = deferred()
    api.setRating.mockReturnValueOnce(rating.promise)
    const rated = marks.setRating([1], 3)
    api.getImages.mockResolvedValueOnce([{ ...card(1), rating: 3 }])
    await gallery.reload()
    await gallery.ensureCards([1])
    rating.reject(new Error('service down'))
    await rated
    expect(gallery.card(1)?.rating).toBe(3)
  })

  it('puts back only the chunks that were not stored', async () => {
    const { api, gallery, marks } = await setup()
    const ids = Array.from({ length: MAX_IDS_PER_MARK + 2 }, (_, index) => index + 1)
    await gallery.ensureCards(ids)
    api.setFavorite
      .mockResolvedValueOnce(MAX_IDS_PER_MARK)
      .mockRejectedValueOnce(new Error('service down'))
    await marks.setFavorite(ids, true)
    expect(gallery.card(1)?.favorite).toBe(true)
    expect(gallery.card(MAX_IDS_PER_MARK)?.favorite).toBe(true)
    expect(gallery.card(MAX_IDS_PER_MARK + 1)?.favorite).toBe(false)
  })
})

const FAVOURITES: GalleryQuery = {
  scope: { kind: GalleryScopeKind.All },
  sort: SortOrder.Newest,
  filters: { favoritesOnly: true }
}

/** A mark call's result, settled by the test. */
function deferred(): { promise: Promise<number>; reject: (error: Error) => void } {
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<number>((_, rejectPromise) => (reject = rejectPromise))
  return { promise, reject }
}

describe('layoutUpdateFor', () => {
  it('defers while an image is open and reloads at once otherwise', () => {
    expect(layoutUpdateFor({ kind: RouteKind.Image, imageId: 1 })).toBe(LayoutUpdate.Deferred)
    expect(layoutUpdateFor({ kind: RouteKind.All })).toBe(LayoutUpdate.Now)
  })
})
