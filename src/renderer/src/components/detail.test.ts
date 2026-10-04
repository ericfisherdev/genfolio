import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { ImageCard } from '@shared/gallery'
import type { GenerationDetails } from '@shared/generation'
import { GenerationFormat, GeneratorKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import { ImageFormat } from '@shared/image-format'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import DetailView from './DetailView.svelte'

/** Just enough generation data for the panel to offer Same seed. */
const FIND_DETAILS = {
  generator: GeneratorKind.A1111,
  origin: MetadataOrigin.PngText,
  prompt: 'a cat',
  negativePrompt: null,
  seed: '1',
  steps: null,
  cfgScale: null,
  sampler: null,
  scheduler: null,
  width: null,
  height: null,
  vae: null,
  styles: null,
  performance: null,
  resources: [],
  paramsFormat: GenerationFormat.A1111Infotext,
  fooocusParams: null,
  params: {},
  sources: []
} satisfies GenerationDetails

const layout = new Int32Array([7, 832, 1216, 8, 1024, 1024, 9, 1024, 1024])

const cardFor = (id: number): ImageCard => ({
  id,
  rootId: 1,
  directoryId: 11,
  fileName: `image-${id}.png`,
  relDir: '2026-09-27',
  format: ImageFormat.Png,
  width: 1024,
  height: 1024,
  sizeBytes: 1_234_567,
  createdAt: Date.UTC(2026, 8, 27, 12),
  addedAt: Date.UTC(2026, 8, 28, 9),
  favorite: false,
  rating: 0,
  similarGroupId: null,
  similarCount: 0
})

async function openDetail(
  imageId: number,
  overrides: Partial<GenfolioApi> = {}
): Promise<TestServices> {
  const harness = testServices(sampleLibrary(), {
    getImageLayout: async () => layout,
    getImages: async (ids) => ids.map(cardFor),
    ...overrides
  })
  await harness.services.library.refresh()
  await harness.services.gallery.load({
    scope: { kind: GalleryScopeKind.Directory, directoryId: 11, recursive: true },
    sort: SortOrder.Newest
  })
  harness.services.router.navigate({ kind: RouteKind.Image, imageId })
  render(DetailView, { context: harness.context })
  return harness
}

describe('DetailView', () => {
  it('shows the position and file details of the image', async () => {
    await openDetail(8)
    expect(screen.getByText('2 / 3')).toBeTruthy()
    const panel = await screen.findByRole('complementary', { name: 'File details' })
    await waitFor(() => expect(panel.textContent).toContain('image-8.png'))
    expect(panel.textContent).toContain('outputs/2026-09-27')
    expect(panel.textContent).toContain('1024 × 1024')
    expect(panel.textContent).toContain('1.2 MB')
  })

  it('reloads the generation data when a scan changes the root list', async () => {
    const getGeneration = vi.fn(async () => null)
    let roots = sampleLibrary().roots
    const { services } = await openDetail(8, { getGeneration, listRoots: async () => roots })
    await waitFor(() => expect(getGeneration).toHaveBeenCalledTimes(1))
    roots = [{ ...roots[0]!, imageCount: 9 }]
    await services.library.refresh()
    await waitFor(() => expect(getGeneration).toHaveBeenCalledTimes(2))
    expect(getGeneration).toHaveBeenLastCalledWith(8)
  })

  it('fetches the open image’s card again when a refresh marks cards stale', async () => {
    let sizeBytes = 1_234_567
    const { services } = await openDetail(8, {
      getImages: async (ids) => ids.map((id) => ({ ...cardFor(id), sizeBytes }))
    })
    const panel = await screen.findByRole('complementary', { name: 'File details' })
    await waitFor(() => expect(panel.textContent).toContain('1.2 MB'))
    sizeBytes = 4_200_000
    await services.gallery.refresh()
    await waitFor(() => expect(panel.textContent).toMatch(/4\.[02] MB/))
  })

  it('ignores find actions while the next image is still loading', async () => {
    const details = { seed: '111' } as GenerationDetails
    const getGeneration = vi.fn((id: number) =>
      id === 8
        ? Promise.resolve({ ...FIND_DETAILS, ...details })
        : new Promise<never>(() => undefined)
    )
    const { services } = await openDetail(8, { getGeneration })
    await screen.findByRole('button', { name: 'Same seed' })
    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(services.router.route).toEqual({ kind: RouteKind.Image, imageId: 9 })
    await fireEvent.click(screen.getByRole('button', { name: 'Same seed' }))
    expect(services.router.route).toEqual({ kind: RouteKind.Image, imageId: 9 })
  })

  it('favourites with F and rates with 0–5', async () => {
    const setFavorite = vi.fn(async () => 1)
    const setRating = vi.fn(async () => 1)
    await openDetail(8, { setFavorite, setRating, getGeneration: async () => null })
    await screen.findByRole('complementary', { name: 'File details' })
    await waitFor(() => expect(screen.getByRole('button', { name: /Favourite/ })).toBeTruthy())
    await fireEvent.keyDown(window, { key: 'f' })
    await fireEvent.keyDown(window, { key: '4' })
    await fireEvent.keyDown(window, { key: '4', ctrlKey: true })
    expect(setFavorite).toHaveBeenCalledWith([8], true)
    expect(setRating).toHaveBeenCalledTimes(1)
    expect(setRating).toHaveBeenCalledWith([8], 4)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '4 stars' }).getAttribute('aria-pressed')).toBe(
        'true'
      )
    )
  })

  it('steps with the arrow keys and stops at the ends', async () => {
    const { services } = await openDetail(8)
    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(services.router.route).toEqual({ kind: RouteKind.Image, imageId: 9 })
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Next image' }) as HTMLButtonElement).disabled
      ).toBe(true)
    )
    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(services.router.route).toEqual({ kind: RouteKind.Image, imageId: 9 })
  })

  it('goes back to the gallery route it came from on Escape', async () => {
    const { services } = await openDetail(7)
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(services.router.route).toEqual({
      kind: RouteKind.Directory,
      directoryId: 11,
      recursive: true
    })
  })

  it('reveals and copies through main', async () => {
    const revealImage = vi.fn(async () => true)
    const copyImagePath = vi.fn(async () => true)
    await openDetail(7, { revealImage, copyImagePath })
    await fireEvent.click(await screen.findByRole('button', { name: 'Show in folder' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Copy path' }))
    expect(revealImage).toHaveBeenCalledWith(7)
    expect(copyImagePath).toHaveBeenCalledWith(7)
  })

  it('leaves keys to the folder tree, open menus and dialogs', async () => {
    const { services } = await openDetail(8)
    const tree = document.createElement('ul')
    tree.setAttribute('role', 'tree')
    const item = document.createElement('li')
    item.tabIndex = 0
    tree.append(item)
    const dialog = document.createElement('dialog')
    const button = document.createElement('button')
    dialog.append(button)
    document.body.append(tree, dialog)

    await fireEvent.keyDown(item, { key: 'ArrowRight' })
    await fireEvent.keyDown(button, { key: 'Escape' })
    const handled = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true
    })
    handled.preventDefault()
    window.dispatchEvent(handled)

    expect(services.router.route).toEqual({ kind: RouteKind.Image, imageId: 8 })
  })
})

describe('library changes while an image is open', () => {
  it('reload the results so the gallery is current on return', async () => {
    const getImageLayout = vi.fn(async () => layout)
    const listRoots = vi.fn(async () => sampleLibrary().roots)
    const harness = testServices(sampleLibrary(), {
      getImageLayout,
      listRoots,
      getImages: async (ids) => ids.map(cardFor)
    })
    await harness.services.library.refresh()
    await harness.services.gallery.load({
      scope: { kind: GalleryScopeKind.All },
      sort: SortOrder.Newest
    })
    harness.services.router.navigate({ kind: RouteKind.Image, imageId: 8 })
    render(AppShell, { context: harness.context })
    const callsBefore = getImageLayout.mock.calls.length

    listRoots.mockResolvedValue([])
    await harness.services.library.refresh()

    await waitFor(() => expect(getImageLayout.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})

describe('marks on the detail page of a favourites view', () => {
  const FAVOURITES = { favoritesOnly: true as const }

  async function openFavourite(imageId: number): Promise<{
    harness: TestServices
    getImageLayout: ReturnType<typeof vi.fn<() => Promise<Int32Array>>>
    setFavorite: ReturnType<typeof vi.fn<() => Promise<number>>>
  }> {
    let favourites = layout
    const getImageLayout = vi.fn(async () => favourites)
    const setFavorite = vi.fn(async () => {
      favourites = new Int32Array([7, 832, 1216, 9, 1024, 1024])
      return 1
    })
    const harness = testServices(sampleLibrary(), {
      getImageLayout,
      setFavorite,
      getImages: async (ids) => ids.map((id) => ({ ...cardFor(id), favorite: true })),
      getGeneration: async () => null
    })
    await harness.services.library.refresh()
    harness.services.router.navigate({ kind: RouteKind.All, filters: FAVOURITES })
    render(AppShell, { context: harness.context })
    await waitFor(() => expect(harness.services.gallery.count).toBe(3))
    harness.services.router.navigate({ kind: RouteKind.Image, imageId })
    await screen.findByRole('button', { name: /Favourite/ })
    return { harness, getImageLayout, setFavorite }
  }

  it('keep stepping through the results the viewer opened', async () => {
    const { harness, setFavorite } = await openFavourite(8)
    await fireEvent.keyDown(window, { key: 'f' })
    await waitFor(() => expect(setFavorite).toHaveBeenCalledWith([8], false))
    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(harness.services.router.route).toEqual({ kind: RouteKind.Image, imageId: 9 })
  })

  it('reload the results when the grid is shown again', async () => {
    const { harness, getImageLayout, setFavorite } = await openFavourite(8)
    await fireEvent.keyDown(window, { key: 'f' })
    await waitFor(() => expect(setFavorite).toHaveBeenCalled())
    const callsBefore = getImageLayout.mock.calls.length
    harness.services.router.navigate({ kind: RouteKind.All, filters: FAVOURITES })
    await waitFor(() => expect(harness.services.gallery.count).toBe(2))
    expect(getImageLayout.mock.calls.length).toBe(callsBefore + 1)
  })

  it('ignore a held key', async () => {
    const { setFavorite } = await openFavourite(8)
    await fireEvent.keyDown(window, { key: 'f', repeat: true })
    expect(setFavorite).not.toHaveBeenCalled()
  })
})

describe('deleting from the detail page', () => {
  it('moves the image to the trash with Delete and shows the next one', async () => {
    const deleteImages = vi.fn(async (ids: readonly number[]) => ({
      cancelled: false,
      deleted: [...ids],
      missing: [],
      failed: []
    }))
    const { services } = await openDetail(8, { deleteImages, getGeneration: async () => null })
    await fireEvent.keyDown(window, { key: 'Delete' })
    await waitFor(() => expect(deleteImages).toHaveBeenCalledWith([8], 'trash'))
    await waitFor(() =>
      expect(services.router.route).toEqual({ kind: RouteKind.Image, imageId: 9 })
    )
    await fireEvent.keyDown(window, { key: 'Delete', shiftKey: true })
    await waitFor(() => expect(deleteImages).toHaveBeenLastCalledWith([9], 'permanent'))
    // 9 was the last image, so the previous one is shown.
    await waitFor(() =>
      expect(services.router.route).toEqual({ kind: RouteKind.Image, imageId: 8 })
    )
  })

  it('stays on the image when the confirmation is declined', async () => {
    const deleteImages = vi.fn(async () => ({
      cancelled: true,
      deleted: [],
      missing: [],
      failed: []
    }))
    const { services } = await openDetail(8, { deleteImages, getGeneration: async () => null })
    await fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }))
    await waitFor(() => expect(deleteImages).toHaveBeenCalled())
    expect(services.router.route).toEqual({ kind: RouteKind.Image, imageId: 8 })
  })
})
