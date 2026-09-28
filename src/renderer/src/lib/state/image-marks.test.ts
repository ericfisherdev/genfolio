import { describe, expect, it, vi, type Mock } from 'vitest'
import { GalleryScopeKind, MAX_IDS_PER_MARK, SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery, ImageCard } from '@shared/gallery'
import { ImageFormat } from '@shared/image-format'
import { GalleryState } from './gallery.svelte'
import { ImageMarks } from './image-marks'

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
}

function fakeApi(): FakeApi {
  return {
    getImageLayout: vi.fn(async () => new Int32Array([1, 1, 1, 2, 1, 1])),
    getImages: vi.fn(async (ids: readonly number[]) => ids.map(card)),
    setFavorite: vi.fn(async (ids: readonly number[]) => ids.length),
    setRating: vi.fn(async (ids: readonly number[]) => ids.length)
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
  return { api, gallery, notices, marks: new ImageMarks(api, gallery, notices) }
}

describe('ImageMarks', () => {
  it('updates cards at once and sends the change', async () => {
    const { api, gallery, marks } = await setup()
    const pending = marks.setFavorite([1, 2], true)
    expect(gallery.card(1)?.favorite).toBe(true)
    await pending
    expect(api.setFavorite).toHaveBeenCalledWith([1, 2], true)
    await marks.setRating([2], 4)
    expect(gallery.card(2)?.rating).toBe(4)
  })

  it('puts cards back and says so when the change fails', async () => {
    const { api, gallery, notices, marks } = await setup()
    api.setRating.mockRejectedValueOnce(new Error('service down'))
    await marks.setRating([1, 2], 5)
    expect(gallery.card(1)?.rating).toBe(0)
    expect(notices.notify).toHaveBeenCalledWith('Could not rate 2 images: service down')
  })

  it('sends large selections in chunks', async () => {
    const { api, marks } = await setup()
    const ids = Array.from({ length: MAX_IDS_PER_MARK + 5 }, (_, index) => index + 1)
    await marks.setFavorite(ids, true)
    expect(api.setFavorite.mock.calls.map(([chunk]) => chunk.length)).toEqual([MAX_IDS_PER_MARK, 5])
  })

  it('reloads the layout only when the results depend on marks', async () => {
    const plain = await setup()
    await plain.marks.setFavorite([1], true)
    expect(plain.api.getImageLayout).toHaveBeenCalledTimes(1)
    const favourites = await setup({
      scope: { kind: GalleryScopeKind.All },
      sort: SortOrder.Newest,
      filters: { favoritesOnly: true }
    })
    await favourites.marks.setFavorite([1], false)
    expect(favourites.api.getImageLayout).toHaveBeenCalledTimes(2)
    const byRating = await setup({ scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Rating })
    await byRating.marks.setRating([1], 2)
    expect(byRating.api.getImageLayout).toHaveBeenCalledTimes(2)
  })
})
