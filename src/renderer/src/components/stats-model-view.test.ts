import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import { ChangeOutcome } from '@shared/change-outcome'
import type { GenfolioApi } from '@shared/genfolio-api'
import { ModelKind } from '@shared/generation-kinds'
import type { ModelPair, ModelStat, ModelStatsOverview, ModelUsage } from '@shared/model-stats'
import type { ModelTagRef } from '@shared/model-tags'
import { EMPTY_MODEL_FIELDS, type ModelDetail, type ModelKey } from '@shared/models'
import { SetMatchMode } from '@shared/search-kinds'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import StatsView from './StatsView.svelte'

const stat = (
  id: number,
  kind: ModelKind,
  name: string,
  imageCount: number,
  tags: readonly ModelTagRef[] = []
): ModelStat => ({ id, kind, identity: name.toLowerCase(), name, imageCount, tags })

const ALPHA = stat(1, ModelKind.Checkpoint, 'Alpha', 7)
const BETA = stat(4, ModelKind.Checkpoint, 'Beta', 2)
const DETAIL = stat(2, ModelKind.Lora, 'Detail', 5, [{ id: 3, name: 'lighting' }])
const SHARP = stat(3, ModelKind.Lora, 'Sharp', 4)

const pair = (first: ModelStat, second: ModelStat, imageCount: number): ModelPair => ({
  first,
  second,
  imageCount
})

const keyOf = ({ kind, identity }: ModelStat): ModelKey => ({ kind, identity })

const DETAIL_USAGE: ModelUsage = {
  model: DETAIL,
  loras: [pair(DETAIL, SHARP, 2)],
  checkpoints: [pair(ALPHA, DETAIL, 3), pair(BETA, DETAIL, 1)]
}

const ALPHA_USAGE: ModelUsage = {
  model: ALPHA,
  loras: [pair(ALPHA, DETAIL, 3)],
  checkpoints: []
}

const OVERVIEW: ModelStatsOverview = {
  checkpoints: [ALPHA],
  loras: [DETAIL],
  checkpointLoraPairs: [],
  loraPairs: []
}

function usageApi(usages: readonly ModelUsage[]): GenfolioApi['getModelUsage'] {
  return async (key) =>
    usages.find(
      (usage) => usage.model.kind === key.kind && usage.model.identity === key.identity
    ) ?? null
}

function harness(overrides: Partial<GenfolioApi> = {}): TestServices {
  return testServices(sampleLibrary(), {
    getModelStats: async () => OVERVIEW,
    getModelUsage: usageApi([DETAIL_USAGE, ALPHA_USAGE]),
    listModelTags: async () => [{ id: 3, name: 'lighting', modelCount: 1 }],
    ...overrides
  })
}

function openDrillDown(services: TestServices['services'], model: ModelStat): void {
  services.router.navigate({ kind: RouteKind.Stats, model: keyOf(model) })
}

const handAdded = (model: ModelStat): ModelDetail => ({
  ...keyOf(model),
  name: model.name,
  imageCount: 0,
  hasInfo: false,
  baseModel: null,
  triggerWords: [],
  strength: null,
  tags: [],
  custom: EMPTY_MODEL_FIELDS,
  civitai: null,
  addedByHand: true
})

describe('StatsModelView', () => {
  it('shows a LoRA with its checkpoints and the LoRAs used with it, and hides the overview controls', async () => {
    const { context, services } = harness()
    openDrillDown(services, DETAIL)
    render(StatsView, { context })

    const article = await screen.findByRole('article', { name: 'Detail usage' })
    expect(within(article).getByRole('heading', { name: 'Detail' })).toBeTruthy()
    expect(article.textContent).toContain('LoRA · 5 images')

    const checkpoints = within(
      within(article).getByRole('region', { name: 'Checkpoints it is used with' })
    )
    expect(checkpoints.getByRole('link', { name: 'Alpha' })).toBeTruthy()
    expect(checkpoints.getByRole('link', { name: 'Beta' })).toBeTruthy()
    expect(checkpoints.getByRole('cell', { name: '3' })).toBeTruthy()

    const partners = within(within(article).getByRole('region', { name: 'LoRAs used with it' }))
    expect(partners.getByRole('link', { name: 'Sharp' })).toBeTruthy()
    expect(partners.getByRole('cell', { name: '2' })).toBeTruthy()

    expect(screen.queryByRole('combobox', { name: 'Model tag' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Checkpoints.*as model or refiner/ })).toBeNull()
  })

  it('shows only the LoRAs used with a checkpoint', async () => {
    const { context, services } = harness()
    openDrillDown(services, ALPHA)
    render(StatsView, { context })
    const article = await screen.findByRole('article', { name: 'Alpha usage' })
    expect(
      within(article).getByRole('region', { name: 'LoRAs used with this checkpoint' })
    ).toBeTruthy()
    expect(
      within(article).queryByRole('region', { name: /Checkpoints it is used with/ })
    ).toBeNull()
    expect(within(article).getByRole('link', { name: 'Detail' }).getAttribute('href')).toBe(
      '#/stats/lora/detail'
    )
  })

  it('says so when a list is empty', async () => {
    const lonely: ModelUsage = { model: SHARP, loras: [], checkpoints: [] }
    const { context, services } = harness({ getModelUsage: usageApi([lonely]) })
    openDrillDown(services, SHARP)
    render(StatsView, { context })
    await screen.findByText('No image pairs it with a checkpoint.')
    expect(screen.getByText('No other LoRA is used with it.')).toBeTruthy()
  })

  it('shows the images of the model, of a checkpoint pair and of a LoRA pair in the gallery', async () => {
    const { context, services } = harness()
    openDrillDown(services, DETAIL)
    render(StatsView, { context })
    await screen.findByRole('article', { name: 'Detail usage' })

    await fireEvent.click(screen.getByRole('button', { name: 'Show all images using Detail' }))
    expect(services.router.route).toEqual({
      kind: RouteKind.All,
      filters: { loras: { ids: [2], mode: SetMatchMode.Any } }
    })

    openDrillDown(services, DETAIL)
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Show images using Alpha and Detail' })
    )
    expect(services.router.route).toEqual({
      kind: RouteKind.All,
      filters: { checkpointIds: [1], loras: { ids: [2], mode: SetMatchMode.Any } }
    })

    openDrillDown(services, DETAIL)
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Show images using Detail and Sharp' })
    )
    expect(services.router.route).toEqual({
      kind: RouteKind.All,
      filters: { loras: { ids: [2, 3], mode: SetMatchMode.All } }
    })
  })

  it('opens the model in the Models page', async () => {
    const { context, services } = harness()
    openDrillDown(services, DETAIL)
    render(StatsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: 'Open Detail in Models' }))
    expect(services.router.route).toEqual({
      kind: RouteKind.Models,
      model: { kind: ModelKind.Lora, identity: 'detail' }
    })
  })

  it('goes back to the overview, keeping the tag it was narrowed to, and follows the route to another model', async () => {
    const getModelStats = vi.fn<GenfolioApi['getModelStats']>(async () => OVERVIEW)
    const getModelUsage = vi.fn(usageApi([DETAIL_USAGE, ALPHA_USAGE]))
    const { context, services, hash } = harness({ getModelStats, getModelUsage })
    services.router.navigate({
      kind: RouteKind.Stats,
      modelTagId: 3,
      model: keyOf(DETAIL)
    })
    render(StatsView, { context })
    const back = await screen.findByRole('link', { name: 'Back to overview' })
    expect(back.getAttribute('href')).toBe('#/stats?mtag=3')
    expect(getModelStats).not.toHaveBeenCalled()

    hash.change('#/stats/checkpoint/alpha')
    await screen.findByRole('article', { name: 'Alpha usage' })
    expect(getModelUsage).toHaveBeenLastCalledWith(keyOf(ALPHA))

    hash.change('#/stats?mtag=3')
    await screen.findByRole('region', { name: /Checkpoints/ })
    expect(getModelStats).toHaveBeenCalledWith({ modelTagId: 3 })
    expect(screen.getByRole('combobox', { name: /^Model tag$/ })).toBeTruthy()
  })

  it('says it is loading, and offers to try again after a failure', async () => {
    const getModelUsage = vi
      .fn<GenfolioApi['getModelUsage']>()
      .mockRejectedValueOnce(new Error('database is locked'))
      .mockResolvedValue(DETAIL_USAGE)
    const { context, services } = harness({ getModelUsage })
    openDrillDown(services, DETAIL)
    render(StatsView, { context })
    await screen.findByText(/could not be loaded/)
    expect(services.library.notice).toBe('Could not load how the model is used: database is locked')
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'Detail' })
    expect(screen.queryByText(/could not be loaded/)).toBeNull()
  })

  describe('a model no image uses', () => {
    it('says it is not used, and still edits its tags and opens in Models', async () => {
      const { context, services } = harness({
        getModelUsage: async () => null,
        getModel: async () => handAdded(SHARP)
      })
      openDrillDown(services, SHARP)
      render(StatsView, { context })
      await screen.findByText('Not used by any image.')
      expect(screen.getByRole('heading', { name: 'Sharp' })).toBeTruthy()
      expect(screen.getByText(/not used by any image/)).toBeTruthy()
      expect(screen.getByRole('combobox', { name: 'Add a model tag' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Open Sharp in Models' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Show all images/ })).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(services.library.notice).toBeUndefined()
    })

    it('says it is not used for a model nothing knows, with no tag editor', async () => {
      const { context, services } = harness({
        getModelUsage: async () => null,
        getModel: async () => null
      })
      openDrillDown(services, SHARP)
      render(StatsView, { context })
      await screen.findByText('Not used by any image.')
      expect(screen.queryByRole('combobox', { name: 'Add a model tag' })).toBeNull()
      expect(screen.queryByRole('button', { name: /in Models/ })).toBeNull()
    })
  })

  it('tags the model in the drill-down and reloads, and removes the tag again', async () => {
    const tagged: ModelTagRef[] = []
    const applyModelTag = vi.fn<GenfolioApi['applyModelTag']>(async () => {
      tagged.push({ id: 3, name: 'lighting' })
      return true
    })
    const { context, services } = harness({
      getModelUsage: async () => ({ ...DETAIL_USAGE, model: { ...DETAIL, tags: [...tagged] } }),
      createModelTag: async () => ({
        outcome: ChangeOutcome.Done,
        tag: { id: 3, name: 'lighting', modelCount: 0 }
      }),
      applyModelTag,
      removeModelTag: async () => {
        tagged.length = 0
        return true
      }
    })
    openDrillDown(services, DETAIL)
    render(StatsView, { context })
    await screen.findByRole('article', { name: 'Detail usage' })
    // The article shows while loading too; the tag editor appears only once the model has loaded.
    const box = await screen.findByRole('combobox', { name: 'Add a model tag' })
    expect(screen.queryByRole('list', { name: 'Tags of this model' })).toBeNull()

    await fireEvent.input(box, { target: { value: 'lighting' } })
    await fireEvent.keyDown(box, { key: 'Enter' })
    expect(applyModelTag).toHaveBeenCalledWith(3, keyOf(DETAIL))
    const chips = await screen.findByRole('list', { name: 'Tags of this model' })
    expect(within(chips).getByText('lighting')).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Remove tag lighting' }))
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Tags of this model' })).toBeNull()
    )
  })

  it('reloads when the library changes, once a drill-down is open', async () => {
    const getModelUsage = vi.fn(usageApi([DETAIL_USAGE]))
    const listRoots = vi.fn(async () => sampleLibrary().roots)
    const { context, services } = harness({ getModelUsage, listRoots })
    openDrillDown(services, DETAIL)
    await services.library.refresh()
    render(AppShell, { context })
    await screen.findByRole('article', { name: 'Detail usage' })
    expect(getModelUsage).toHaveBeenCalledTimes(1)

    listRoots.mockResolvedValue(sampleLibrary().roots.map((root) => ({ ...root, imageCount: 9 })))
    await services.library.refresh()
    await waitFor(() => expect(getModelUsage).toHaveBeenCalledTimes(2))
  })

  it('does not load the usage before a drill-down has been opened', async () => {
    const getModelUsage = vi.fn(usageApi([DETAIL_USAGE]))
    const { context, services } = harness({ getModelUsage, applyModelTag: async () => true })
    await services.library.refresh()
    render(StatsView, { context })
    await services.modelTags.apply({ id: 3, name: 'lighting' }, keyOf(DETAIL))
    expect(getModelUsage).not.toHaveBeenCalled()
  })
})
