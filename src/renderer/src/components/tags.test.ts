import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import { MAX_IDS_PER_MARK } from '@shared/gallery-kinds'
import { SetMatchMode } from '@shared/search-kinds'
import { TagOutcome } from '@shared/tag-kinds'
import type { Tag } from '@shared/tags'
import { RouteKind } from '../lib/routing/route'
import { TagsState } from '../lib/state/tags.svelte'
import { sampleLibrary, testServices } from '../lib/testing/app-services'
import SidebarTags from './SidebarTags.svelte'
import TagCombobox from './TagCombobox.svelte'
import TagEditor from './TagEditor.svelte'

const RED: Tag = { id: 1, name: 'red', imageCount: 3 }
const BLUE: Tag = { id: 2, name: 'Blue', imageCount: 1 }

describe('TagsState', () => {
  it('returns the existing tag for a duplicate name and reloads after each change', async () => {
    const onchange = vi.fn()
    const notices = { notify: vi.fn<(message: string) => void>() }
    const api = {
      listTags: vi.fn(async () => [RED]),
      createTag: vi.fn(async () => ({ outcome: TagOutcome.Duplicate, existing: RED }) as const),
      renameTag: vi.fn(async () => ({ outcome: TagOutcome.Duplicate, existing: BLUE }) as const),
      mergeTags: vi.fn(),
      deleteTag: vi.fn(),
      applyTags: vi.fn(async () => 1),
      removeTags: vi.fn()
    }
    const tags = new TagsState(api, notices, onchange)
    expect(await tags.ensure('RED')).toEqual(RED)
    await tags.rename(RED, 'blue')
    expect(notices.notify).toHaveBeenCalledWith(
      'A tag named “blue” already exists; merge into it instead.'
    )
    expect(api.listTags).toHaveBeenCalledTimes(2)
    expect(onchange).toHaveBeenCalledTimes(2)
    expect(tags.tags).toEqual([RED])
  })

  it('reports a failed command and still reloads', async () => {
    const notices = { notify: vi.fn<(message: string) => void>() }
    const api = {
      listTags: vi.fn(async () => []),
      createTag: vi.fn(),
      renameTag: vi.fn(),
      mergeTags: vi.fn(),
      deleteTag: vi.fn(),
      applyTags: vi.fn(async () => {
        throw new Error('service down')
      }),
      removeTags: vi.fn()
    }
    const tags = new TagsState(api, notices, () => undefined)
    await tags.apply([RED], [5])
    expect(notices.notify).toHaveBeenCalledWith('Could not tag the images: service down')
    expect(api.listTags).toHaveBeenCalled()
  })
})

describe('TagsState.apply', () => {
  it('tags large selections in chunks and resolves whether it worked', async () => {
    const applyTags = vi.fn(
      async (_tagIds: readonly number[], ids: readonly number[]) => ids.length
    )
    const api = {
      listTags: vi.fn(async () => [RED]),
      createTag: vi.fn(),
      renameTag: vi.fn(),
      mergeTags: vi.fn(),
      deleteTag: vi.fn(),
      applyTags,
      removeTags: vi.fn()
    }
    const tags = new TagsState(api, { notify: vi.fn() }, () => undefined)
    const ids = Array.from({ length: MAX_IDS_PER_MARK + 3 }, (_, index) => index + 1)
    expect(await tags.apply([RED], ids)).toBe(true)
    expect(applyTags.mock.calls.map(([, chunk]) => chunk.length)).toEqual([MAX_IDS_PER_MARK, 3])
    applyTags.mockRejectedValueOnce(new Error('service down'))
    expect(await tags.apply([RED], [1])).toBe(false)
  })
})

describe('TagCombobox', () => {
  function renderBox(applied: number[] = []): ReturnType<typeof vi.fn> {
    const onpick = vi.fn()
    render(TagCombobox, { props: { tags: [RED, BLUE], applied, onpick } })
    return onpick
  }

  it('suggests matching tags, picks with the arrows and Enter, and offers to create', async () => {
    const onpick = renderBox()
    const input = screen.getByRole('combobox', { name: 'Add a tag' })
    await fireEvent.input(input, { target: { value: 'bl' } })
    const options = screen.getAllByRole('option')
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Blue 1', 'Create “bl”'])
    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id)
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(onpick).toHaveBeenCalledWith(BLUE)
    await fireEvent.input(input, { target: { value: 'green' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(onpick).toHaveBeenLastCalledWith('green')
  })

  it('picks an existing tag typed in another case instead of creating it, and hides applied ones', async () => {
    const onpick = renderBox([RED.id])
    const input = screen.getByRole('combobox', { name: 'Add a tag' })
    await fireEvent.input(input, { target: { value: 'BLUE' } })
    expect(screen.queryByText('Create “BLUE”')).toBeNull()
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(onpick).toHaveBeenCalledWith(BLUE)
    await fireEvent.input(input, { target: { value: 're' } })
    expect(screen.queryByRole('option', { name: /^red/ })).toBeNull()
  })

  it('keeps its keys away from the page shortcuts', async () => {
    renderBox()
    const outside = vi.fn()
    window.addEventListener('keydown', outside)
    const input = screen.getByRole('combobox', { name: 'Add a tag' })
    await fireEvent.input(input, { target: { value: 'x' } })
    await fireEvent.keyDown(input, { key: 'Escape' })
    expect(outside).not.toHaveBeenCalled()
    window.removeEventListener('keydown', outside)
  })
})

describe('TagEditor', () => {
  it('shows the image’s tags, creates and applies a new one, and removes one', async () => {
    let imageTags: Tag[] = [RED]
    const harness = testServices(sampleLibrary(), {
      listTags: async () => [RED, BLUE],
      getImageTags: async () => imageTags,
      createTag: vi.fn(
        async (name: string) =>
          ({
            outcome: TagOutcome.Done,
            tag: { id: 3, name, imageCount: 0 }
          }) as const
      ),
      applyTags: vi.fn(async () => {
        imageTags = [...imageTags, { id: 3, name: 'green', imageCount: 1 }]
        return 1
      }),
      removeTags: vi.fn(async () => {
        imageTags = imageTags.filter((tag) => tag.id !== RED.id)
        return 1
      })
    })
    await harness.services.tags.load()
    render(TagEditor, { props: { imageId: 8 }, context: harness.context })
    const chips = await screen.findByRole('list', { name: 'Tags of this image' })
    expect(chips.textContent).toContain('red')
    const input = screen.getByRole('combobox', { name: 'Add a tag' })
    await fireEvent.input(input, { target: { value: 'green' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(harness.api.applyTags).toHaveBeenCalledWith([3], [8]))
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Tags of this image' }).textContent).toContain(
        'green'
      )
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Remove tag red' }))
    await waitFor(() => expect(harness.api.removeTags).toHaveBeenCalledWith([1], [8]))
  })
})

describe('SidebarTags', () => {
  it('opens a tag’s images and renames, merges and deletes through dialogs', async () => {
    const harness = testServices(sampleLibrary(), {
      listTags: async () => [RED, BLUE],
      renameTag: vi.fn(async () => ({ outcome: TagOutcome.Done, tag: RED }) as const),
      mergeTags: vi.fn(async () => ({ outcome: TagOutcome.Done, tag: BLUE }) as const),
      deleteTag: vi.fn(async () => true)
    })
    await harness.services.tags.load()
    render(SidebarTags, { context: harness.context })
    const list = screen.getByRole('list', { name: 'Tags' })
    await fireEvent.click(within(list).getByRole('button', { name: /^red/ }))
    expect(harness.services.router.route).toEqual({
      kind: RouteKind.All,
      filters: { tags: { ids: [1], mode: SetMatchMode.Any } }
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Actions for tag red' }))
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }))
    const renameDialog = screen.getByRole('dialog', { name: 'Rename tag' })
    await fireEvent.input(within(renameDialog).getByRole('textbox'), {
      target: { value: 'crimson' }
    })
    await fireEvent.click(within(renameDialog).getByRole('button', { name: 'Rename' }))
    await waitFor(() => expect(harness.api.renameTag).toHaveBeenCalledWith(1, 'crimson'))

    await fireEvent.click(screen.getByRole('button', { name: 'Actions for tag red' }))
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Merge into…' }))
    const mergeDialog = screen.getByRole('dialog', { name: /^Merge “red”/ })
    await fireEvent.click(within(mergeDialog).getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(harness.api.mergeTags).toHaveBeenCalledWith(1, 2))

    await fireEvent.click(screen.getByRole('button', { name: 'Actions for tag Blue' }))
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    await fireEvent.click(
      within(screen.getByRole('dialog', { name: /^Delete the tag/ })).getByRole('button', {
        name: 'Delete'
      })
    )
    await waitFor(() => expect(harness.api.deleteTag).toHaveBeenCalledWith(2))
  })
})
