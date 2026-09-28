import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { ImageCard } from '@shared/gallery'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import { ImageFormat } from '@shared/image-format'
import { ChangeOutcome } from '@shared/change-outcome'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import BulkBar from './BulkBar.svelte'
import GalleryCard from './GalleryCard.svelte'

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

describe('GalleryCard selection', () => {
  function renderCard(selecting: boolean): { onopen: () => void; onselect: () => void } {
    const onopen = vi.fn()
    const onselect = vi.fn()
    render(GalleryCard, {
      props: {
        imageId: 7,
        card: cardFor(7),
        onopen,
        onreveal: vi.fn(),
        oncopypath: vi.fn(),
        oncopy: vi.fn(),
        onsameprompt: vi.fn(),
        onfavorite: vi.fn(),
        onrate: vi.fn(),
        selected: false,
        selecting,
        onselect
      }
    })
    return { onopen, onselect }
  }

  it('opens on a plain click, toggles on Ctrl-click and extends on Shift-click', async () => {
    const { onopen, onselect } = renderCard(false)
    const open = screen.getByRole('button', { name: 'Open image-7.png' })
    await fireEvent.click(open)
    expect(onopen).toHaveBeenCalledTimes(1)
    await fireEvent.click(open, { ctrlKey: true })
    expect(onselect).toHaveBeenLastCalledWith(false)
    await fireEvent.click(open, { shiftKey: true })
    expect(onselect).toHaveBeenLastCalledWith(true)
    expect(onopen).toHaveBeenCalledTimes(1)
  })

  it('selects on a plain click while other images are selected, and through its checkbox', async () => {
    const { onopen, onselect } = renderCard(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Open image-7.png' }))
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select image-7.png' }))
    expect(onselect).toHaveBeenCalledTimes(2)
    expect(onopen).not.toHaveBeenCalled()
  })
})

async function openGallery(overrides: Partial<GenfolioApi> = {}): Promise<TestServices> {
  const harness = testServices(sampleLibrary(), {
    getImageLayout: async () => layout,
    getImages: async (ids) => ids.map(cardFor),
    ...overrides
  })
  await harness.services.library.refresh()
  harness.services.router.navigate({ kind: RouteKind.All })
  render(AppShell, { context: harness.context })
  await waitFor(() => expect(harness.services.gallery.count).toBe(3))
  return harness
}

describe('gallery selection keys', () => {
  it('select everything with Ctrl+A and clear with Escape', async () => {
    const { services } = await openGallery()
    await fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect(services.selection.list()).toEqual([7, 8, 9])
    await screen.findByRole('toolbar', { name: 'Selected images' })
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(services.selection.count).toBe(0)
    await waitFor(() =>
      expect(screen.queryByRole('toolbar', { name: 'Selected images' })).toBe(null)
    )
  })

  it('leave Ctrl+A to a text field', async () => {
    const { services } = await openGallery()
    const field = document.createElement('input')
    document.body.append(field)
    await fireEvent.keyDown(field, { key: 'a', ctrlKey: true })
    expect(services.selection.count).toBe(0)
    field.remove()
  })

  it('drop the selection when the results change', async () => {
    const { services } = await openGallery()
    services.selection.selectAll()
    services.sort.set(SortOrder.Oldest)
    await waitFor(() => expect(services.selection.count).toBe(0))
  })
})

describe('BulkBar', () => {
  async function renderBar(overrides: Partial<GenfolioApi> = {}): Promise<TestServices> {
    const harness = testServices(sampleLibrary(), {
      getImageLayout: async () => layout,
      getImages: async (ids) => ids.map(cardFor),
      ...overrides
    })
    await harness.services.gallery.load({
      scope: { kind: GalleryScopeKind.All },
      sort: SortOrder.Newest
    })
    await harness.services.gallery.ensureCards([7, 8, 9])
    harness.services.selection.toggle(9)
    harness.services.selection.toggle(7)
    render(BulkBar, { context: harness.context })
    return harness
  }

  it('favourites, unfavourites and rates the selection and says so', async () => {
    const setFavorite = vi.fn(async (ids: readonly number[]) => ids.length)
    const setRating = vi.fn(async (ids: readonly number[]) => ids.length)
    const { services } = await renderBar({ setFavorite, setRating })
    expect(screen.getByText('2 images selected')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: '♥ Favourite' }))
    await waitFor(() => expect(setFavorite).toHaveBeenCalledWith([7, 9], true))
    await waitFor(() => expect(services.library.notice).toBe('Added 2 images to favourites.'))
    await fireEvent.click(screen.getByRole('button', { name: '♡ Unfavourite' }))
    await waitFor(() => expect(setFavorite).toHaveBeenLastCalledWith([7, 9], false))
    await fireEvent.click(screen.getByRole('button', { name: '3 stars' }))
    await waitFor(() => expect(setRating).toHaveBeenCalledWith([7, 9], 3))
    expect(services.gallery.card(9)?.rating).toBe(3)
    await waitFor(() => expect(services.library.notice).toBe('Rated 2 images ★★★.'))
  })

  it('creates a typed tag and applies it to the selection', async () => {
    const created = { id: 4, name: 'keeper', imageCount: 0 }
    const createTag = vi.fn(async () => ({ outcome: ChangeOutcome.Done, tag: created }) as const)
    const applyTags = vi.fn(async () => 2)
    const { services } = await renderBar({ createTag, applyTags })
    const input = screen.getByRole('combobox', { name: 'Tag them' })
    await fireEvent.input(input, { target: { value: 'keeper' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(applyTags).toHaveBeenCalledWith([4], [7, 9]))
    await waitFor(() => expect(services.library.notice).toBe('Tagged 2 images with “keeper”.'))
  })

  it('reports a failure without claiming success', async () => {
    const setFavorite = vi.fn(async () => {
      throw new Error('service down')
    })
    const { services } = await renderBar({ setFavorite })
    await fireEvent.click(screen.getByRole('button', { name: '♥ Favourite' }))
    await waitFor(() =>
      expect(services.library.notice).toBe('Could not favourite 2 images: service down')
    )
  })

  it('selects all or clears', async () => {
    const { services } = await renderBar()
    await fireEvent.click(screen.getByRole('button', { name: 'Select all 3' }))
    expect(services.selection.count).toBe(3)
    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(services.selection.count).toBe(0)
  })
})
