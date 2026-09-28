import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import { AlbumKind, ChangeOutcome, type Album } from '@shared/albums'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { ImageCard } from '@shared/gallery'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import { ImageFormat } from '@shared/image-format'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import BulkBar from './BulkBar.svelte'
import SidebarAlbums from './SidebarAlbums.svelte'

const TRIP: Album = { id: 3, name: 'Trip', kind: AlbumKind.Manual, imageCount: 2, coverImageId: 7 }
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

async function servicesWith(overrides: Partial<GenfolioApi> = {}): Promise<TestServices> {
  const harness = testServices(sampleLibrary(), {
    listAlbums: async () => [TRIP],
    getImageLayout: async () => layout,
    getImages: async (ids) => ids.map(cardFor),
    ...overrides
  })
  await harness.services.albums.load()
  return harness
}

describe('SidebarAlbums', () => {
  it('lists albums and opens one', async () => {
    const { services, context } = await servicesWith()
    render(SidebarAlbums, { context })
    const list = screen.getByRole('list', { name: 'Albums' })
    await fireEvent.click(within(list).getByRole('button', { name: /^Trip/ }))
    expect(services.router.route).toEqual({ kind: RouteKind.Album, albumId: 3 })
    expect(within(list).getByRole('button', { name: /^Trip/ }).getAttribute('aria-current')).toBe(
      'page'
    )
  })

  it('creates an album and opens it', async () => {
    const created: Album = { ...TRIP, id: 4, name: 'Keepers', imageCount: 0, coverImageId: null }
    const createAlbum = vi.fn(
      async () => ({ outcome: ChangeOutcome.Done, album: created }) as const
    )
    const { services, context } = await servicesWith({ createAlbum })
    render(SidebarAlbums, { context })
    await fireEvent.click(screen.getByRole('button', { name: 'New album' }))
    const dialog = screen.getByRole('dialog', { name: 'New album' })
    await fireEvent.input(within(dialog).getByRole('textbox'), { target: { value: ' Keepers ' } })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(createAlbum).toHaveBeenCalledWith('Keepers'))
    await waitFor(() =>
      expect(services.router.route).toEqual({ kind: RouteKind.Album, albumId: 4 })
    )
  })

  it('deletes the open album after asking, and leaves it', async () => {
    const deleteAlbum = vi.fn(async () => true)
    const { services, context } = await servicesWith({ deleteAlbum })
    services.router.navigate({ kind: RouteKind.Album, albumId: 3 })
    render(SidebarAlbums, { context })
    await fireEvent.click(screen.getByRole('button', { name: 'Actions for album Trip' }))
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete the album “Trip”?' })
    expect(dialog.textContent).toContain('Its images stay in the library')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteAlbum).toHaveBeenCalledWith(3))
    await waitFor(() => expect(services.router.route).toEqual({ kind: RouteKind.All }))
  })
})

describe('adding to an album from the bulk bar', () => {
  async function renderBar(overrides: Partial<GenfolioApi>): Promise<TestServices> {
    const harness = await servicesWith(overrides)
    await harness.services.gallery.load({
      scope: { kind: GalleryScopeKind.All },
      sort: SortOrder.Newest
    })
    harness.services.selection.selectAll()
    render(BulkBar, { context: harness.context })
    return harness
  }

  it('adds the selection to a picked album and says how many were new', async () => {
    const addToAlbum = vi.fn(async () => 1)
    const { services } = await renderBar({ addToAlbum })
    await fireEvent.click(screen.getByRole('button', { name: 'Add to album…' }))
    const dialog = screen.getByRole('dialog', { name: 'Add 3 images to an album' })
    const input = within(dialog).getByRole('combobox', { name: 'Album' })
    await fireEvent.input(input, { target: { value: 'tri' } })
    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(addToAlbum).toHaveBeenCalledWith(3, [7, 8, 9]))
    await waitFor(() =>
      expect(services.library.notice).toBe('Added 1 image to “Trip”. 2 images were already in it.')
    )
  })

  it('creates an album from a typed name', async () => {
    const created: Album = { ...TRIP, id: 5, name: 'New one', imageCount: 0, coverImageId: null }
    const createAlbum = vi.fn(
      async () => ({ outcome: ChangeOutcome.Done, album: created }) as const
    )
    const addToAlbum = vi.fn(async () => 3)
    await renderBar({ createAlbum, addToAlbum })
    await fireEvent.click(screen.getByRole('button', { name: 'Add to album…' }))
    const input = screen.getByRole('combobox', { name: 'Album' })
    await fireEvent.input(input, { target: { value: 'New one' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(addToAlbum).toHaveBeenCalledWith(5, [7, 8, 9]))
  })

  it('removes the selection from the album on show', async () => {
    const removeFromAlbum = vi.fn(async () => 3)
    const harness = await servicesWith({ removeFromAlbum })
    await harness.services.gallery.load({
      scope: { kind: GalleryScopeKind.Album, albumId: 3 },
      sort: SortOrder.AlbumOrder
    })
    harness.services.selection.selectAll()
    render(BulkBar, { context: harness.context })
    await fireEvent.click(screen.getByRole('button', { name: 'Remove from album' }))
    await waitFor(() => expect(removeFromAlbum).toHaveBeenCalledWith(3, [7, 8, 9]))
    await waitFor(() =>
      expect(harness.services.library.notice).toBe('Removed 3 images from “Trip”.')
    )
  })
})

describe('an album view', () => {
  it('is titled by the album, counts its images and sorts by album order', async () => {
    const getImageLayout = vi.fn(async () => layout)
    const { services, context } = await servicesWith({ getImageLayout })
    await services.library.refresh()
    services.router.navigate({ kind: RouteKind.Album, albumId: 3 })
    render(AppShell, { context })
    expect(await screen.findByRole('heading', { level: 1, name: 'Trip' })).toBeTruthy()
    await waitFor(() =>
      expect(getImageLayout).toHaveBeenCalledWith({
        scope: { kind: GalleryScopeKind.Album, albumId: 3 },
        sort: SortOrder.AlbumOrder
      })
    )
    const sort = screen.getByRole('combobox', { name: 'Sort by' }) as HTMLSelectElement
    expect(sort.value).toBe(SortOrder.AlbumOrder)
    await fireEvent.change(sort, { target: { value: SortOrder.Rating } })
    expect(services.sort.album).toBe(SortOrder.Rating)
    expect(services.sort.current).toBe(SortOrder.Newest)
  })

  it('says when the album no longer exists', async () => {
    const { services, context } = await servicesWith({ listAlbums: async () => [] })
    await services.library.refresh()
    services.router.navigate({ kind: RouteKind.Album, albumId: 3 })
    render(AppShell, { context })
    expect(await screen.findByText('This album no longer exists.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Album not found' })).toBeTruthy()
  })
})

describe('saving a smart album', () => {
  it('saves a library search and opens it; a folder search offers no saving', async () => {
    const smart: Album = { ...TRIP, id: 6, name: 'Faves', kind: AlbumKind.Smart }
    const createSmartAlbum = vi.fn(
      async () => ({ outcome: ChangeOutcome.Done, album: smart }) as const
    )
    const { services, context } = await servicesWith({
      createSmartAlbum,
      listAlbums: async () => [smart]
    })
    await services.library.refresh()
    services.router.navigate({ kind: RouteKind.All, filters: { favoritesOnly: true } })
    render(AppShell, { context })
    await fireEvent.click(await screen.findByRole('button', { name: 'Save as smart album…' }))
    const dialog = screen.getByRole('dialog', { name: 'Save as smart album' })
    await fireEvent.input(within(dialog).getByRole('textbox'), { target: { value: 'Faves' } })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(createSmartAlbum).toHaveBeenCalledWith('Faves', { favoritesOnly: true })
    )
    await waitFor(() =>
      expect(services.router.route).toEqual({ kind: RouteKind.Album, albumId: 6 })
    )
    // A smart album sorts like the library and has no album order to offer.
    const sort = (await screen.findByRole('combobox', { name: 'Sort by' })) as HTMLSelectElement
    expect([...sort.options].map((option) => option.value)).not.toContain(SortOrder.AlbumOrder)
    expect(
      within(screen.getByRole('list', { name: 'Albums' })).getByText('Smart album')
    ).toBeTruthy()

    services.router.navigate({
      kind: RouteKind.Directory,
      directoryId: 11,
      recursive: true,
      filters: { favoritesOnly: true }
    })
    await screen.findByRole('button', { name: 'Remove Favourites' })
    expect(screen.queryByRole('button', { name: 'Save as smart album…' })).toBeNull()
  })
})
