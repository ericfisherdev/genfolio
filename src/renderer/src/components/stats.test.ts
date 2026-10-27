import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { GenfolioApi } from '@shared/genfolio-api'
import { ModelKind } from '@shared/generation-kinds'
import type { ModelPair, ModelStat, ModelStatsOverview } from '@shared/model-stats'
import { SetMatchMode } from '@shared/search-kinds'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import Sidebar from './Sidebar.svelte'
import StatsView from './StatsView.svelte'

const checkpoint = (id: number, name: string, imageCount: number): ModelStat => ({
  id,
  kind: ModelKind.Checkpoint,
  identity: name.toLowerCase(),
  name,
  imageCount,
  tags: []
})

const lora = (
  id: number,
  name: string,
  imageCount: number,
  tags: ModelStat['tags'] = []
): ModelStat => ({
  ...checkpoint(id, name, imageCount),
  kind: ModelKind.Lora,
  tags
})

const ALPHA = checkpoint(1, 'Alpha', 7)
const DETAIL = lora(2, 'Detail', 5, [{ id: 3, name: 'lighting' }])
const SHARP = lora(3, 'Sharp', 4)

const pair = (first: ModelStat, second: ModelStat, imageCount: number): ModelPair => ({
  first,
  second,
  imageCount
})

const OVERVIEW: ModelStatsOverview = {
  checkpoints: [ALPHA],
  loras: [DETAIL, SHARP],
  checkpointLoraPairs: [pair(ALPHA, DETAIL, 3)],
  loraPairs: [pair(DETAIL, SHARP, 2)]
}

const EMPTY: ModelStatsOverview = {
  checkpoints: [],
  loras: [],
  checkpointLoraPairs: [],
  loraPairs: []
}

function harness(overrides: Partial<GenfolioApi> = {}): TestServices {
  return testServices(sampleLibrary(), {
    getModelStats: async () => OVERVIEW,
    listModelTags: async () => [{ id: 3, name: 'lighting', modelCount: 1 }],
    ...overrides
  })
}

function sectionNamed(name: RegExp): HTMLElement {
  return screen.getByRole('region', { name })
}

describe('StatsView', () => {
  it('lists four ranked tables with counts, and notes that checkpoints count as model or refiner', async () => {
    const { context } = harness()
    render(StatsView, { context })
    const checkpoints = await screen.findByRole('region', {
      name: /Checkpoints.*as model or refiner/
    })
    expect(within(checkpoints).getByRole('link', { name: 'Alpha' })).toBeTruthy()
    expect(within(checkpoints).getByRole('cell', { name: '7' })).toBeTruthy()

    const loras = within(sectionNamed(/^LoRAs$/))
    const rows = loras.getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Detail'),
      expect.stringContaining('Sharp')
    ])
    const tagged = loras.getByRole('list', { name: 'Tags of Detail' })
    expect(within(tagged).getByText('lighting')).toBeTruthy()
    expect(loras.queryByRole('list', { name: 'Tags of Sharp' })).toBeNull()

    const withCheckpoints = within(sectionNamed(/LoRAs used with checkpoints/))
    expect(withCheckpoints.getByRole('link', { name: 'Alpha' })).toBeTruthy()
    expect(withCheckpoints.getByRole('link', { name: 'Detail' })).toBeTruthy()
    expect(withCheckpoints.getByRole('cell', { name: '3' })).toBeTruthy()

    const together = within(sectionNamed(/LoRAs used together/))
    expect(together.getByRole('link', { name: 'Detail' })).toBeTruthy()
    expect(together.getByRole('link', { name: 'Sharp' })).toBeTruthy()
    expect(together.getByRole('cell', { name: '2' })).toBeTruthy()
  })

  it('links each model to its drill-down route, with the identity encoded', async () => {
    const odd = { ...ALPHA, identity: 'a b?#%/c', name: 'Odd' }
    const { context, services } = harness({
      getModelStats: async () => ({ ...EMPTY, checkpoints: [odd] })
    })
    render(StatsView, { context })
    const link = await screen.findByRole('link', { name: 'Odd' })
    expect(link.getAttribute('href')).toBe('#/stats/checkpoint/a%20b%3F%23%25%2Fc')
    expect(services.router.route).toEqual({ kind: RouteKind.All })
  })

  it('shows the images of a model, of a checkpoint with a LoRA and of two LoRAs in the gallery', async () => {
    const { context, services } = harness()
    render(StatsView, { context })
    await screen.findByRole('region', { name: /Checkpoints/ })

    await fireEvent.click(
      within(sectionNamed(/Checkpoints/)).getByRole('button', {
        name: 'Show images using Alpha'
      })
    )
    expect(services.router.route).toEqual({
      kind: RouteKind.All,
      filters: { checkpointIds: [1] }
    })

    await fireEvent.click(
      within(sectionNamed(/LoRAs used with checkpoints/)).getByRole('button', {
        name: 'Show images using Alpha and Detail'
      })
    )
    expect(services.router.route).toEqual({
      kind: RouteKind.All,
      filters: { checkpointIds: [1], loras: { ids: [2], mode: SetMatchMode.Any } }
    })

    await fireEvent.click(
      within(sectionNamed(/LoRAs used together/)).getByRole('button', {
        name: 'Show images using Detail and Sharp'
      })
    )
    expect(services.router.route).toEqual({
      kind: RouteKind.All,
      filters: { loras: { ids: [2, 3], mode: SetMatchMode.All } }
    })
  })

  it('narrows to a model tag through the route, and Back restores the unfiltered view', async () => {
    const getModelStats = vi.fn<GenfolioApi['getModelStats']>(async (query) =>
      query?.modelTagId === 3 ? { ...EMPTY, loras: [DETAIL] } : OVERVIEW
    )
    const { context, services, hash } = harness({ getModelStats })
    services.router.navigate({ kind: RouteKind.Stats })
    render(StatsView, { context })
    await screen.findAllByRole('link', { name: 'Sharp' })

    const select = screen.getByRole('combobox', { name: 'Model tag' })
    await within(select).findByRole('option', { name: 'lighting (1)' })
    await fireEvent.change(select, { target: { value: '3' } })
    expect(hash.current).toBe('#/stats?mtag=3')
    await waitFor(() => expect(screen.queryAllByRole('link', { name: 'Sharp' })).toHaveLength(0))
    expect(getModelStats).toHaveBeenLastCalledWith({ modelTagId: 3 })
    expect((select as HTMLSelectElement).value).toBe('3')

    hash.change('#/stats')
    await screen.findAllByRole('link', { name: 'Sharp' })
    expect(getModelStats).toHaveBeenLastCalledWith(undefined)
    expect((select as HTMLSelectElement).value).toBe('')
  })

  it('opens already narrowed when the route names a tag', async () => {
    const getModelStats = vi.fn<GenfolioApi['getModelStats']>(async () => OVERVIEW)
    const { context, services } = harness({ getModelStats })
    services.router.navigate({ kind: RouteKind.Stats, modelTagId: 3 })
    render(StatsView, { context })
    await screen.findAllByRole('link', { name: 'Sharp' })
    expect(getModelStats).toHaveBeenCalledWith({ modelTagId: 3 })
  })

  it('says it is loading, then shows nothing stale', async () => {
    let answer: (overview: ModelStatsOverview) => void = () => undefined
    const { context } = harness({
      getModelStats: () => new Promise<ModelStatsOverview>((resolve) => (answer = resolve))
    })
    render(StatsView, { context })
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Loading statistics…')
    answer(OVERVIEW)
    await screen.findAllByRole('link', { name: 'Sharp' })
    expect(screen.queryByText('Loading statistics…')).toBeNull()
  })

  it('reports a failure in the notice bar and offers to try again', async () => {
    const getModelStats = vi
      .fn<GenfolioApi['getModelStats']>()
      .mockRejectedValueOnce(new Error('database is locked'))
      .mockResolvedValue(OVERVIEW)
    const { context, services } = harness({ getModelStats })
    render(StatsView, { context })
    await screen.findByText('The statistics could not be loaded.')
    expect(services.library.notice).toBe('Could not load the model statistics: database is locked')
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findAllByRole('link', { name: 'Sharp' })
    expect(screen.queryByText('The statistics could not be loaded.')).toBeNull()
  })

  it('explains an empty library, an empty tag and a library without model data', async () => {
    const empty = testServices(
      { roots: [], trees: {} },
      { getModelStats: async () => EMPTY, listModelTags: async () => [] }
    )
    render(StatsView, { context: empty.context })
    await screen.findByText('Add a folder to see how your models are used.')
  })

  it('explains a library without model data, and a tag no image uses', async () => {
    const { context, services } = harness({ getModelStats: async () => EMPTY })
    await services.library.refresh()
    const view = render(StatsView, { context })
    await screen.findByText(/No image has model information yet/)
    services.router.navigate({ kind: RouteKind.Stats, modelTagId: 3 })
    await screen.findByText('No image uses a model with this tag.')
    view.unmount()
  })

  it('says which lists are empty while showing the others', async () => {
    const { context } = harness({
      getModelStats: async () => ({ ...EMPTY, checkpoints: [ALPHA] })
    })
    render(StatsView, { context })
    await screen.findByRole('link', { name: 'Alpha' })
    expect(screen.getByText('No LoRAs.')).toBeTruthy()
    expect(screen.getByText('No LoRA is used with a checkpoint.')).toBeTruthy()
    expect(screen.getByText('No two LoRAs are used together.')).toBeTruthy()
  })
})

describe('Stats navigation', () => {
  it('opens from the sidebar, marked current, and replaces the gallery and its filter bar', async () => {
    const { context, services, hash } = harness()
    await services.library.refresh()
    render(AppShell, { context })
    expect(await screen.findByRole('search', { name: 'Filter images' })).toBeTruthy()
    const entry = within(screen.getByRole('navigation')).getByRole('button', { name: 'Stats' })
    expect(entry.getAttribute('aria-current')).toBeNull()
    await fireEvent.click(entry)
    expect(services.router.route).toEqual({ kind: RouteKind.Stats })
    expect(hash.current).toBe('#/stats')
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeTruthy()
    expect(entry.getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('search', { name: 'Filter images' })).toBeNull()
  })

  it('marks the sidebar entry current for a drill-down link too', () => {
    const { context, services } = harness()
    services.router.navigate({
      kind: RouteKind.Stats,
      model: { kind: ModelKind.Lora, identity: 'detail' }
    })
    render(Sidebar, { context })
    expect(screen.getByRole('button', { name: 'Stats' }).getAttribute('aria-current')).toBe('page')
  })

  it('lands on a gallery whose filters are the pair row, from the page in the shell', async () => {
    const { context, services } = harness()
    services.router.navigate({ kind: RouteKind.Stats })
    await services.library.refresh()
    render(AppShell, { context })
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Show images using Alpha and Detail' })
    )
    expect(services.router.route).toEqual({
      kind: RouteKind.All,
      filters: { checkpointIds: [1], loras: { ids: [2], mode: SetMatchMode.Any } }
    })
    expect(await screen.findByRole('search', { name: 'Filter images' })).toBeTruthy()
  })

  it('reloads the statistics when the library changes and when model tags change', async () => {
    const getModelStats = vi.fn<GenfolioApi['getModelStats']>(async () => OVERVIEW)
    const listRoots = vi.fn(async () => sampleLibrary().roots)
    const { context, services } = harness({
      getModelStats,
      listRoots,
      applyModelTag: async () => true
    })
    services.router.navigate({ kind: RouteKind.Stats })
    await services.library.refresh()
    render(AppShell, { context })
    await screen.findAllByRole('link', { name: 'Sharp' })
    expect(getModelStats).toHaveBeenCalledTimes(1)

    listRoots.mockResolvedValue(sampleLibrary().roots.map((root) => ({ ...root, imageCount: 9 })))
    await services.library.refresh()
    await waitFor(() => expect(getModelStats).toHaveBeenCalledTimes(2))

    await services.modelTags.apply({ id: 3, name: 'lighting' }, DETAIL)
    await waitFor(() => expect(getModelStats).toHaveBeenCalledTimes(3))
  })

  it('does not load the statistics before the page has been opened', async () => {
    const getModelStats = vi.fn<GenfolioApi['getModelStats']>(async () => OVERVIEW)
    const { context, services } = harness({ getModelStats, applyModelTag: async () => true })
    await services.library.refresh()
    render(AppShell, { context })
    await services.modelTags.apply({ id: 3, name: 'lighting' }, DETAIL)
    await services.library.refresh()
    expect(getModelStats).not.toHaveBeenCalled()
  })
})
