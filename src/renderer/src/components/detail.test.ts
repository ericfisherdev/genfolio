import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { ImageCard } from '@shared/gallery'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import { ImageFormat } from '@shared/image-format'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import DetailView from './DetailView.svelte'

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
  addedAt: Date.UTC(2026, 8, 28, 9)
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
