import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import { SortOrder } from '@shared/gallery-kinds'
import { AddRootOutcome } from '@shared/library-kinds'
import { RouteKind } from '../lib/routing/route'
import type { GenfolioApi } from '@shared/genfolio-api'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import DirectoryTree from './DirectoryTree.svelte'
import LibraryView from './LibraryView.svelte'
import Sidebar from './Sidebar.svelte'
import SortMenu from './SortMenu.svelte'
import TopBar from './TopBar.svelte'

async function loaded(overrides: Partial<GenfolioApi> = {}): Promise<TestServices> {
  const harness = testServices(sampleLibrary(), overrides)
  await harness.services.library.refresh()
  return harness
}

describe('Sidebar', () => {
  it('shows All Photos with the total and each root as a folder tree', async () => {
    const { context } = await loaded()
    render(Sidebar, { context })
    expect(screen.getByRole('button', { name: /All Photos/ }).textContent).toContain('8')
    expect(screen.getByRole('treeitem', { name: 'outputs, 8 images' })).toBeTruthy()
    expect(screen.getByRole('treeitem', { name: '2026-09-27, 6 images' })).toBeTruthy()
  })

  it('opens a folder route when a folder is clicked', async () => {
    const { context, services, hash } = await loaded()
    render(Sidebar, { context })
    await fireEvent.click(screen.getByRole('treeitem', { name: '2026-09-27, 6 images' }))
    expect(services.router.route).toEqual({
      kind: RouteKind.Directory,
      directoryId: 11,
      recursive: true
    })
    expect(hash.current).toBe('#/dir/11?recursive=1')
  })

  it('asks before removing a root and says the files stay on disk', async () => {
    const removeRoot = vi.fn(async () => true)
    const { context } = await loaded({ removeRoot })
    render(Sidebar, { context })
    await fireEvent.click(screen.getByRole('button', { name: 'Actions for outputs' }))
    await fireEvent.click(screen.getByRole('menuitem', { name: /Remove from library/ }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('stay on disk and are not deleted')
    expect(removeRoot).not.toHaveBeenCalled()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removeRoot).toHaveBeenCalledWith(1))
  })

  it('cancelling the confirmation keeps the root', async () => {
    const removeRoot = vi.fn(async () => true)
    const { context } = await loaded({ removeRoot })
    render(Sidebar, { context })
    await fireEvent.click(screen.getByRole('button', { name: 'Actions for outputs' }))
    await fireEvent.click(screen.getByRole('menuitem', { name: /Remove from library/ }))
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })
    )
    expect(removeRoot).not.toHaveBeenCalled()
  })
})

describe('RootMenu', () => {
  it('closes on Escape and on a click elsewhere', async () => {
    const { context } = await loaded()
    render(Sidebar, { context })
    const trigger = screen.getByRole('button', { name: 'Actions for outputs' })
    await fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeTruthy()
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()

    await fireEvent.click(trigger)
    await fireEvent.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('DirectoryTree keyboard', () => {
  it('moves with arrows, collapses and expands, and selects with Enter', async () => {
    const onselect = vi.fn()
    const tree = sampleLibrary().trees[1]!
    render(DirectoryTree, {
      props: { tree, rootLabel: 'outputs', selectedId: undefined, onselect }
    })
    const root = screen.getByRole('treeitem', { name: 'outputs, 8 images' })
    root.focus()

    await fireEvent.keyDown(root, { key: 'ArrowDown' })
    const first = screen.getByRole('treeitem', { name: '2026-09-27, 6 images' })
    expect(document.activeElement).toBe(first)
    expect(first.getAttribute('tabindex')).toBe('0')
    expect(root.getAttribute('tabindex')).toBe('-1')

    await fireEvent.keyDown(first, { key: 'Enter' })
    expect(onselect).toHaveBeenCalledWith(11)

    await fireEvent.keyDown(first, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(root)
    await fireEvent.keyDown(root, { key: 'ArrowLeft' })
    expect(root.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('treeitem', { name: '2026-09-27, 6 images' })).toBeNull()
    await fireEvent.keyDown(root, { key: 'ArrowRight' })
    expect(root.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('DirectoryTree roving focus', () => {
  it('keeps the root tabbable when the selected folder is in another tree', () => {
    const tree = sampleLibrary().trees[1]!
    render(DirectoryTree, {
      props: { tree, rootLabel: 'outputs', selectedId: 999, onselect: vi.fn() }
    })
    expect(
      screen.getByRole('treeitem', { name: 'outputs, 8 images' }).getAttribute('tabindex')
    ).toBe('0')
  })

  it('keeps one tabbable item after the focused folder is collapsed away', async () => {
    const tree = sampleLibrary().trees[1]!
    render(DirectoryTree, {
      props: { tree, rootLabel: 'outputs', selectedId: 11, onselect: vi.fn() }
    })
    const root = screen.getByRole('treeitem', { name: 'outputs, 8 images' })
    await fireEvent.click(root.querySelector('.toggle') as Element)
    const tabbable = screen
      .getAllByRole('treeitem')
      .filter((item) => item.getAttribute('tabindex') === '0')
    expect(tabbable).toEqual([root])
  })
})

describe('SortMenu', () => {
  it('changes and persists the sort order', async () => {
    const { context, services } = await loaded()
    render(SortMenu, { context })
    await fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), {
      target: { value: SortOrder.FileName }
    })
    expect(services.sort.current).toBe(SortOrder.FileName)
  })
})

describe('TopBar', () => {
  it('titles the view and toggles subfolders for a folder with children', async () => {
    const { context, services } = await loaded()
    render(TopBar, { context })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('All Photos')

    services.router.navigate({ kind: RouteKind.Directory, directoryId: 10, recursive: true })
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('outputs')
    )
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Include subfolders' }))
    expect(services.router.route).toMatchObject({ directoryId: 10, recursive: false })
  })
})

describe('stale scan progress', () => {
  it('disappears once the scanning root is no longer in the library', async () => {
    const listRoots = vi.fn(async () => sampleLibrary().roots)
    const harness = await loaded({ listRoots })
    render(AppShell, { context: harness.context })
    harness.emitScan({ type: 'progress', rootId: 1, phase: 'indexing', done: 3, total: 9 } as never)
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Scan progress' }).textContent).toContain(
        'Indexing'
      )
    )

    listRoots.mockResolvedValue([])
    await harness.services.library.refresh()
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Scan progress' }).textContent?.trim()).toBe('')
    )
  })
})

describe('LibraryView', () => {
  it('shows a load failure with Retry', async () => {
    const listRoots = vi
      .fn()
      .mockRejectedValueOnce(new Error('service unavailable'))
      .mockResolvedValue(sampleLibrary().roots)
    const harness = testServices(sampleLibrary(), { listRoots })
    await harness.services.library.refresh()
    render(LibraryView, { context: harness.context })
    expect(screen.getByRole('alert').textContent).toContain('service unavailable')
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByText('8 images')).toBeTruthy())
  })

  it('says so when the routed folder no longer exists', async () => {
    const harness = await loaded()
    harness.services.router.navigate({
      kind: RouteKind.Directory,
      directoryId: 999,
      recursive: true
    })
    render(LibraryView, { context: harness.context })
    render(TopBar, { context: harness.context })
    expect(screen.getByText('This folder is no longer in the library.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Folder not found')
  })

  it('offers to add a folder when the library is empty', async () => {
    const addRootViaDialog = vi.fn(async () => ({ outcome: AddRootOutcome.Cancelled as const }))
    const harness = testServices({ roots: [], trees: {} }, { addRootViaDialog })
    await harness.services.library.refresh()
    render(LibraryView, { context: harness.context })
    expect(screen.getByRole('heading', { name: 'Your library is empty' })).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Add folder' }))
    expect(addRootViaDialog).toHaveBeenCalledOnce()
  })

  it('reloads stale results when the gallery mounts again after the roots changed', async () => {
    let layout = new Int32Array([7, 100, 100, 8, 100, 100])
    const getImageLayout = vi.fn(async () => layout)
    const listRoots = vi.fn(async () => sampleLibrary().roots)
    const harness = testServices(sampleLibrary(), { listRoots, getImageLayout })
    await harness.services.library.refresh()
    render(LibraryView, { context: harness.context })
    await waitFor(() => expect(harness.services.gallery.count).toBe(2))

    listRoots.mockResolvedValue([])
    await harness.services.library.refresh()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Your library is empty' })).toBeTruthy()
    )

    layout = new Int32Array([9, 100, 100])
    listRoots.mockResolvedValue(sampleLibrary().roots)
    await harness.services.library.refresh()
    await waitFor(() =>
      expect(harness.services.gallery.layout).toEqual(new Int32Array([9, 100, 100]))
    )
  })
})
