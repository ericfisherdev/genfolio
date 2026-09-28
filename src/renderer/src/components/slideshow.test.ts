import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { ImageCard } from '@shared/gallery'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import type { GenerationDetails } from '@shared/generation'
import { ImageFormat } from '@shared/image-format'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'

const layout = new Int32Array([7, 1, 1, 8, 1, 1, 9, 1, 1])

const cardFor = (id: number): ImageCard => ({
  id,
  rootId: 1,
  directoryId: 11,
  fileName: `image-${id}.png`,
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

afterEach(() => {
  vi.restoreAllMocks()
})

async function openSlideshow(
  startId: number,
  overrides: Partial<GenfolioApi> = {}
): Promise<TestServices> {
  const harness = testServices(sampleLibrary(), {
    getImageLayout: async () => layout,
    getImages: async (ids) => ids.map(cardFor),
    ...overrides
  })
  await harness.services.library.refresh()
  await harness.services.gallery.load({
    scope: { kind: GalleryScopeKind.All },
    sort: SortOrder.Newest
  })
  harness.services.router.navigate({ kind: RouteKind.Image, imageId: startId })
  harness.services.slideshowNavigator.start(startId)
  render(AppShell, { context: harness.context })
  return harness
}

const shownId = (): string | null | undefined =>
  document.querySelector('.slide')?.getAttribute('data-image-id')

describe('SlideshowView', () => {
  it('starts at the chosen image, decoding each image before it shows', async () => {
    const decode = vi.spyOn(HTMLImageElement.prototype, 'decode')
    await openSlideshow(8)
    await waitFor(() => expect(shownId()).toBe('8'))
    expect(decode).toHaveBeenCalled()
    const decodedBefore = decode.mock.calls.length
    await fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(shownId()).toBe('9'))
    expect(decode.mock.calls.length).toBeGreaterThan(decodedBefore)
    await fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(shownId()).toBe('8'))
  })

  it('pauses with Space and toggles the prompt with I', async () => {
    const getGeneration = vi.fn(async () => ({ prompt: 'a quiet street' }) as GenerationDetails)
    await openSlideshow(7, { getGeneration })
    await waitFor(() => expect(shownId()).toBe('7'))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
    await fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    await fireEvent.keyDown(window, { key: 'i' })
    expect(await screen.findByText('a quiet street')).toBeTruthy()
    expect(getGeneration).toHaveBeenCalledWith(7)
    await fireEvent.keyDown(window, { key: 'I' })
    await waitFor(() => expect(screen.queryByText('a quiet street')).toBeNull())
  })

  it('returns to the view it was started from on Escape', async () => {
    const { services } = await openSlideshow(9)
    await waitFor(() => expect(shownId()).toBe('9'))
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(services.router.route).toEqual({ kind: RouteKind.Image, imageId: 9 })
  })
})

describe('slideshow presets', () => {
  it('saves the settings under a name and applies a chosen preset', async () => {
    const calm = {
      id: 3,
      name: 'Calm',
      settings: { intervalMs: 15_000, shuffle: true, loop: true, showPrompt: false }
    }
    const saveSlideshowPreset = vi.fn(async () => calm)
    const { services } = await openSlideshow(7, {
      saveSlideshowPreset,
      listSlideshowPresets: async () => [calm]
    })
    await waitFor(() => expect(shownId()).toBe('7'))
    await fireEvent.click(screen.getByRole('button', { name: 'Save preset…' }))
    const dialog = screen.getByRole('dialog', { name: 'Save slideshow preset' })
    await fireEvent.input(within(dialog).getByRole('textbox'), { target: { value: 'Mine' } })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(saveSlideshowPreset).toHaveBeenCalledWith('Mine', services.slideshowSettings.current)
    )
    const choose = screen.getByRole('combobox', { name: 'Preset' })
    await waitFor(() => expect(within(choose).getByRole('option', { name: 'Calm' })).toBeTruthy())
    await fireEvent.change(choose, { target: { value: '3' } })
    expect(services.slideshowSettings.current).toEqual(calm.settings)
  })
})
