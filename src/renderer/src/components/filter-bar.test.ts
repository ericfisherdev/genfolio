import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import { GeneratorKind } from '@shared/generation-kinds'
import { KeywordScope, SetMatchMode } from '@shared/search-kinds'
import type { SearchFacets, SearchFilters } from '@shared/search'
import { RouteKind, routeFilters, type Route } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import FilterBar from './FilterBar.svelte'

const FACETS: SearchFacets = {
  checkpoints: [
    { id: 4, name: 'juggernaut', count: 12 },
    { id: 9, name: 'pony', count: 3 }
  ],
  loras: [
    { id: 2, name: 'detail', count: 7 },
    { id: 5, name: 'style', count: 2 }
  ],
  generators: [
    { kind: GeneratorKind.A1111, count: 10 },
    { kind: GeneratorKind.Fooocus, count: 5 }
  ],
  withoutMetadata: 1
}

async function renderBar(route: Route = { kind: RouteKind.All }): Promise<TestServices> {
  const harness = testServices(sampleLibrary(), { getFacets: async () => FACETS })
  harness.services.router.navigate(route)
  await harness.services.facets.load({
    scope: { kind: GalleryScopeKind.All },
    sort: SortOrder.Newest
  })
  render(FilterBar, { context: harness.context })
  return harness
}

const filters = (harness: TestServices): SearchFilters | undefined =>
  routeFilters(harness.services.router.route)

afterEach(() => vi.useRealTimers())

describe('FilterBar', () => {
  it('applies a typed keyword after a pause, or at once on Enter', async () => {
    vi.useFakeTimers()
    const harness = await renderBar()
    const input = screen.getByRole('searchbox', { name: 'Search prompts' })
    await fireEvent.input(input, { target: { value: 'red hair' } })
    expect(filters(harness)).toBeUndefined()
    await vi.advanceTimersByTimeAsync(300)
    expect(filters(harness)).toEqual({
      keywords: { query: 'red hair', scope: KeywordScope.Positive }
    })
    await fireEvent.input(input, { target: { value: 'blue' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(filters(harness)?.keywords?.query).toBe('blue')
    expect(harness.hash.current).toBe('#/?q=blue')
  })

  it('changes the keyword scope once there is a keyword', async () => {
    const harness = await renderBar({
      kind: RouteKind.All,
      filters: { keywords: { query: 'red', scope: KeywordScope.Positive } }
    })
    await fireEvent.change(screen.getByRole('combobox', { name: 'Search in' }), {
      target: { value: KeywordScope.Both }
    })
    expect(filters(harness)?.keywords?.scope).toBe(KeywordScope.Both)
  })

  it('picks checkpoints from a list with counts, keeping the folder scope', async () => {
    const harness = await renderBar({ kind: RouteKind.Directory, directoryId: 11, recursive: true })
    await fireEvent.click(screen.getByRole('button', { name: /^Checkpoint/ }))
    const dialog = screen.getByRole('dialog', { name: 'Checkpoint' })
    expect(dialog.textContent).toContain('juggernaut')
    expect(dialog.textContent).toContain('12')
    await fireEvent.click(within(dialog).getByRole('checkbox', { name: /pony/ }))
    expect(harness.services.router.route).toEqual({
      kind: RouteKind.Directory,
      directoryId: 11,
      recursive: true,
      filters: { checkpointIds: [9] }
    })
  })

  it('narrows the picker list by name and closes on Escape', async () => {
    await renderBar()
    const trigger = screen.getByRole('button', { name: /^LoRA/ })
    await fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'LoRA' })
    await fireEvent.input(within(dialog).getByRole('searchbox'), { target: { value: 'sty' } })
    expect(within(dialog).queryByRole('checkbox', { name: /detail/ })).toBeNull()
    await fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('sets LoRA ids, match mode and weight range', async () => {
    const harness = await renderBar()
    await fireEvent.click(screen.getByRole('button', { name: /^LoRA/ }))
    const dialog = screen.getByRole('dialog', { name: 'LoRA' })
    await fireEvent.click(within(dialog).getByRole('checkbox', { name: /detail/ }))
    await fireEvent.click(within(dialog).getByRole('checkbox', { name: /style/ }))
    await fireEvent.click(within(dialog).getByRole('radio', { name: /all selected/ }))
    await fireEvent.change(
      within(dialog).getByRole('spinbutton', { name: 'Minimum LoRA weight' }),
      {
        target: { value: '0.5' }
      }
    )
    expect(filters(harness)?.loras).toEqual({ ids: [2, 5], mode: SetMatchMode.All, minWeight: 0.5 })
    await fireEvent.change(
      within(dialog).getByRole('spinbutton', { name: 'Minimum LoRA weight' }),
      {
        target: { value: '' }
      }
    )
    expect(filters(harness)?.loras).toEqual({ ids: [2, 5], mode: SetMatchMode.All })

    const max = within(dialog).getByRole('spinbutton', { name: 'Maximum LoRA weight' })
    await fireEvent.change(max, { target: { value: '0.4' } })
    await fireEvent.change(
      within(dialog).getByRole('spinbutton', { name: 'Minimum LoRA weight' }),
      {
        target: { value: '0.8' }
      }
    )
    expect(filters(harness)?.loras).toEqual({ ids: [2, 5], mode: SetMatchMode.All, minWeight: 0.8 })
  })

  it('toggles generators', async () => {
    const harness = await renderBar()
    const fooocus = screen.getByRole('button', { name: 'Fooocus' })
    expect(fooocus.getAttribute('aria-pressed')).toBe('false')
    await fireEvent.click(fooocus)
    expect(filters(harness)?.generators).toEqual([GeneratorKind.Fooocus])
    await fireEvent.click(screen.getByRole('button', { name: 'Fooocus' }))
    expect(filters(harness)).toBeUndefined()
  })

  it('lists active filters as removable chips with Clear all', async () => {
    const harness = await renderBar({
      kind: RouteKind.All,
      filters: {
        checkpointIds: [4],
        loras: { ids: [2, 5], mode: SetMatchMode.All },
        seed: '7'
      }
    })
    const active = screen.getByRole('list', { name: 'Active filters' })
    expect(active.textContent).toContain('Checkpoint: juggernaut')
    expect(active.textContent).toContain('LoRA (all): detail, style')
    await fireEvent.click(within(active).getByRole('button', { name: 'Remove Seed: 7' }))
    expect(filters(harness)?.seed).toBeUndefined()
    expect(filters(harness)?.checkpointIds).toEqual([4])
    await fireEvent.click(within(active).getByRole('button', { name: 'Clear all' }))
    expect(harness.services.router.route).toEqual({ kind: RouteKind.All })
  })
})
