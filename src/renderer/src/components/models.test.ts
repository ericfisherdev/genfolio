import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import { ChangeOutcome } from '@shared/change-outcome'
import type { GenfolioApi } from '@shared/genfolio-api'
import { ModelKind } from '@shared/generation-kinds'
import {
  EMPTY_MODEL_FIELDS,
  type ModelDetail,
  type ModelEntry,
  type ModelList
} from '@shared/models'
import type { ModelTag, ModelTagRef } from '@shared/model-tags'
import { nameKey } from '@shared/name-key'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import ModelsView from './ModelsView.svelte'
import Sidebar from './Sidebar.svelte'

const entry = (fields: Partial<ModelEntry> = {}): ModelEntry => ({
  kind: ModelKind.Lora,
  identity: 'detail',
  name: 'detail',
  imageCount: 2,
  hasInfo: false,
  baseModel: null,
  triggerWords: [],
  strength: null,
  tags: [],
  ...fields
})

const detail = (fields: Partial<ModelDetail> = {}): ModelDetail => ({
  ...entry(),
  custom: EMPTY_MODEL_FIELDS,
  civitai: null,
  addedByHand: false,
  ...fields
})

const list = (items: ModelEntry[], baseModels: string[] = []): ModelList => ({
  total: items.length,
  items,
  baseModels
})

function harness(overrides: Partial<GenfolioApi> = {}): TestServices {
  return testServices(sampleLibrary(), overrides)
}

const documented = detail({
  hasInfo: true,
  baseModel: 'SDXL 1.0',
  triggerWords: ['add detail', 'sharp'],
  strength: 0.8,
  custom: {
    baseModel: 'SDXL 1.0',
    triggerWords: ['add detail', 'sharp'],
    strength: 0.8,
    description: 'Adds fine detail.',
    notes: 'Keep below 1.0'
  }
})

describe('ModelsView', () => {
  it('lists the models with their kind, base model and whether they have info', async () => {
    const { context } = harness({
      listModels: async () =>
        list([
          entry({ hasInfo: true, baseModel: 'SDXL 1.0' }),
          entry({ kind: ModelKind.Checkpoint, identity: 'alpha', name: 'alpha' })
        ])
    })
    render(ModelsView, { context })
    const items = await screen.findByRole('list', { name: 'Models' })
    expect(within(items).getByRole('button', { name: /detail.*LoRA · SDXL 1\.0/ })).toBeTruthy()
    expect(within(items).getByRole('button', { name: /alpha.*Checkpoint · no info/ })).toBeTruthy()
    expect(screen.getByText('2 models')).toBeTruthy()
  })

  it("shows a model's details and copies its trigger words", async () => {
    const copyModelTriggerWords = vi.fn(async () => true)
    const { context } = harness({
      listModels: async () => list([entry({ hasInfo: true })]),
      getModel: async () => documented,
      copyModelTriggerWords
    })
    render(ModelsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: /detail/ }))
    const panel = await screen.findByRole('article', { name: 'detail details' })
    const own = within(within(panel).getByRole('region', { name: 'Your info' }))
    expect(own.getByText('SDXL 1.0')).toBeTruthy()
    expect(own.getByText('0.8')).toBeTruthy()
    expect(own.getByText('Adds fine detail.')).toBeTruthy()
    expect(within(panel).getByRole('list', { name: 'Trigger words' }).textContent).toContain(
      'sharp'
    )
    await fireEvent.click(within(panel).getByRole('button', { name: 'Copy trigger words' }))
    expect(copyModelTriggerWords).toHaveBeenCalledWith({ kind: 'lora', identity: 'detail' })
  })

  it('searches after a pause and filters by type, base model and missing info', async () => {
    const listModels = vi.fn(async () => list([entry()], ['Pony', 'SDXL 1.0']))
    const { context } = harness({ listModels })
    render(ModelsView, { context })
    await screen.findByRole('list', { name: 'Models' })
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search models' }), {
      target: { value: ' add detail ' }
    })
    await waitFor(() =>
      expect(listModels).toHaveBeenLastCalledWith({ offset: 0, limit: 100, text: 'add detail' })
    )
    await fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'lora' }
    })
    await fireEvent.change(screen.getByRole('combobox', { name: 'Base model' }), {
      target: { value: 'Pony' }
    })
    await fireEvent.click(screen.getByRole('button', { name: 'No info yet' }))
    await waitFor(() =>
      expect(listModels).toHaveBeenLastCalledWith({
        offset: 0,
        limit: 100,
        text: 'add detail',
        kind: 'lora',
        baseModel: 'Pony',
        withoutInfo: true
      })
    )
  })

  it('records fields for a model without info', async () => {
    const saveModel = vi.fn(async (_key, fields) => ({
      outcome: ChangeOutcome.Done as const,
      model: detail({
        custom: fields,
        hasInfo: true,
        baseModel: fields.baseModel,
        triggerWords: fields.triggerWords
      })
    }))
    const { context } = harness({
      listModels: async () => list([entry()]),
      getModel: async () => detail(),
      saveModel
    })
    render(ModelsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: /detail/ }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Add info' }))
    const form = screen.getByRole('form', { name: 'Edit model' })
    await fireEvent.input(within(form).getByLabelText('Base model'), {
      target: { value: ' SDXL ' }
    })
    await fireEvent.input(within(form).getByLabelText('Trigger words'), {
      target: { value: 'add detail\n\n sharp ' }
    })
    await fireEvent.input(within(form).getByLabelText('Strength'), { target: { value: '0.8' } })
    await fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(saveModel).toHaveBeenCalledWith(
        { kind: 'lora', identity: 'detail' },
        {
          baseModel: 'SDXL',
          triggerWords: ['add detail', 'sharp'],
          strength: 0.8,
          description: null,
          notes: null
        }
      )
    )
    await screen.findByRole('button', { name: 'Edit' })
  })

  it('blocks a strength outside the allowed range', async () => {
    const { context } = harness({
      listModels: async () => list([entry()]),
      getModel: async () => detail()
    })
    render(ModelsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: /detail/ }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Add info' }))
    await fireEvent.input(screen.getByLabelText('Strength'), { target: { value: '50' } })
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('adds a model by hand and shows it', async () => {
    const createModel = vi.fn(async (kind, name) => ({
      outcome: ChangeOutcome.Done as const,
      model: detail({ kind, identity: 'my style', name, hasInfo: true, imageCount: 0 })
    }))
    const { context } = harness({ listModels: async () => list([]), createModel })
    render(ModelsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: '+ Add model' }))
    const form = screen.getByRole('form', { name: 'Add a model' })
    expect(
      (within(form).getByRole('button', { name: 'Add model' }) as HTMLButtonElement).disabled
    ).toBe(true)
    await fireEvent.input(within(form).getByLabelText('Name'), { target: { value: 'My Style' } })
    await fireEvent.click(within(form).getByRole('button', { name: 'Add model' }))
    await waitFor(() =>
      expect(createModel).toHaveBeenCalledWith('lora', 'My Style', expect.anything())
    )
    await screen.findByRole('article', { name: 'My Style details' })
    expect(screen.queryByRole('form', { name: 'Add a model' })).toBeNull()
  })

  it('shows the existing entry and says so when the model is already added', async () => {
    const { context, services } = harness({
      listModels: async () => list([]),
      createModel: async () => ({
        outcome: ChangeOutcome.Duplicate as const,
        existing: detail({ hasInfo: true })
      })
    })
    render(ModelsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: '+ Add model' }))
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'detail' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Add model' }))
    await screen.findByRole('article', { name: 'detail details' })
    expect(services.library.notice).toBe('detail already has an entry.')
  })

  it("clears a model's info after confirming", async () => {
    const clearModel = vi.fn<GenfolioApi['clearModel']>(async () => true)
    let cleared = false
    const { context } = harness({
      listModels: async () => list([entry({ hasInfo: !cleared })]),
      getModel: async () => (cleared ? detail() : documented),
      clearModel: async (key) => {
        cleared = true
        return clearModel(key)
      }
    })
    render(ModelsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: /detail/ }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Clear info' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Clear' }))
    await waitFor(() =>
      expect(clearModel).toHaveBeenCalledWith({ kind: 'lora', identity: 'detail' })
    )
    await screen.findByRole('button', { name: 'Add info' })
  })

  it('explains an empty library and an empty search differently', async () => {
    const empty = harness({ listModels: async () => list([]) })
    render(ModelsView, { context: empty.context })
    await screen.findByText(/No models yet/)
    await fireEvent.click(screen.getByRole('button', { name: 'No info yet' }))
    await screen.findByText('No models match.')
  })

  it('reports a failure to load in the notice bar', async () => {
    const { context, services } = harness({
      listModels: async () => {
        throw new Error('service down')
      }
    })
    render(ModelsView, { context })
    await waitFor(() => expect(services.library.notice).toContain('Could not load the models'))
  })

  it('shows more models a page at a time', async () => {
    const page = Array.from({ length: 100 }, (_, n) => entry({ identity: `m${n}`, name: `m${n}` }))
    const listModels = vi.fn(async (query: { offset: number }) => ({
      total: 101,
      items: query.offset === 0 ? page : [entry({ identity: 'last', name: 'last' })],
      baseModels: []
    }))
    const { context } = harness({ listModels })
    render(ModelsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: 'Show more' }))
    await screen.findByRole('button', { name: /^last/ })
    expect(listModels).toHaveBeenLastCalledWith({ offset: 100, limit: 100 })
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })
})

describe('Models navigation', () => {
  it('opens from the sidebar and replaces the gallery', async () => {
    const { context, services, hash } = harness({ listModels: async () => list([]) })
    await services.library.refresh()
    render(AppShell, { context })
    await fireEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Models' })
    )
    expect(services.router.route).toEqual({ kind: RouteKind.Models })
    expect(hash.current).toBe('#/models')
    expect(await screen.findByRole('heading', { name: 'Models' })).toBeTruthy()
    expect(screen.queryByRole('search', { name: 'Filter images' })).toBeNull()
  })

  it('marks the sidebar entry current', async () => {
    const { context, services } = harness()
    services.router.navigate({ kind: RouteKind.Models })
    render(Sidebar, { context })
    expect(screen.getByRole('button', { name: 'Models' }).getAttribute('aria-current')).toBe('page')
  })
})

/** A model "detail" and a tag vocabulary kept in memory, served through the tag and model calls. */
function taggingApi(vocabulary: ModelTag[] = []): Partial<GenfolioApi> & { tagged: ModelTagRef[] } {
  const tagged: ModelTagRef[] = []
  const withTags = <T extends ModelEntry>(model: T): T => ({ ...model, tags: [...tagged] })
  const countOf = (tag: ModelTag): ModelTag => ({
    ...tag,
    modelCount: tagged.some((ref) => ref.id === tag.id) ? 1 : 0
  })
  return {
    tagged,
    listModels: async (query) =>
      list(
        query.modelTagId === undefined || tagged.some((ref) => ref.id === query.modelTagId)
          ? [withTags(entry())]
          : []
      ),
    getModel: async () => withTags(detail()),
    listModelTags: async () => vocabulary.map(countOf),
    createModelTag: async (name) => {
      const existing = vocabulary.find((tag) => nameKey(tag.name) === nameKey(name))
      if (existing) return { outcome: ChangeOutcome.Duplicate, existing: countOf(existing) }
      const tag = { id: vocabulary.length + 1, name, modelCount: 0 }
      vocabulary.push(tag)
      return { outcome: ChangeOutcome.Done, tag }
    },
    applyModelTag: async (tagId) => {
      const tag = vocabulary.find((candidate) => candidate.id === tagId)
      if (tag && !tagged.some((ref) => ref.id === tagId))
        tagged.push({ id: tag.id, name: tag.name })
      return tag !== undefined
    },
    removeModelTag: async (tagId) => {
      const at = tagged.findIndex((ref) => ref.id === tagId)
      if (at >= 0) tagged.splice(at, 1)
      return at >= 0
    }
  }
}

describe('Model tags on the Models page', () => {
  it('adds a tag in the detail panel and shows it there and on the list row, then removes it', async () => {
    const { context } = harness(taggingApi())
    render(ModelsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: /detail/ }))
    const panel = await screen.findByRole('article', { name: 'detail details' })
    const box = within(panel).getByRole('combobox', { name: 'Add a model tag' })
    await fireEvent.input(box, { target: { value: 'lighting' } })
    await fireEvent.keyDown(box, { key: 'Enter' })

    const chips = await within(panel).findByRole('list', { name: 'Tags of this model' })
    expect(within(chips).getByText('lighting')).toBeTruthy()
    const row = within(screen.getByRole('list', { name: 'Models' })).getByRole('button', {
      name: /detail/
    })
    await waitFor(() => expect(within(row).getByText('lighting')).toBeTruthy())

    await fireEvent.click(within(panel).getByRole('button', { name: 'Remove tag lighting' }))
    await waitFor(() =>
      expect(within(panel).queryByRole('list', { name: 'Tags of this model' })).toBeNull()
    )
    await waitFor(() => expect(within(row).queryByText('lighting')).toBeNull())
  })

  it('reuses an existing tag typed in another case or Unicode form, and creates a new name', async () => {
    const api = taggingApi([{ id: 1, name: 'Élan', modelCount: 0 }])
    const createModelTag = vi.spyOn(
      api as { createModelTag: GenfolioApi['createModelTag'] },
      'createModelTag'
    )
    const { context } = harness(api)
    render(ModelsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: /detail/ }))
    const panel = await screen.findByRole('article', { name: 'detail details' })
    const box = within(panel).getByRole('combobox', { name: 'Add a model tag' })
    await within(screen.getByRole('combobox', { name: 'Model tag' })).findByRole('option', {
      name: 'Élan (0)'
    })

    const decomposed = 'E\u0301LAN'
    await fireEvent.input(box, { target: { value: decomposed } })
    expect(screen.queryByText(`Create “${decomposed}”`)).toBeNull()
    await fireEvent.keyDown(box, { key: 'Enter' })
    await within(panel).findByText('Élan')
    expect(createModelTag).not.toHaveBeenCalled()

    await fireEvent.input(box, { target: { value: 'disney' } })
    await fireEvent.keyDown(box, { key: 'Enter' })
    await within(panel).findByText('disney')
    expect(createModelTag).toHaveBeenCalledWith('disney')
  })

  it('offers each tag with how many models carry it and narrows the list by one', async () => {
    const api = taggingApi([{ id: 1, name: 'lighting', modelCount: 0 }])
    const listModels = vi.spyOn(api as { listModels: GenfolioApi['listModels'] }, 'listModels')
    const { context } = harness(api)
    render(ModelsView, { context })
    await screen.findByRole('list', { name: 'Models' })
    const filter = await screen.findByRole('combobox', { name: 'Model tag' })
    await waitFor(() =>
      expect(within(filter).getByRole('option', { name: 'lighting (0)' })).toBeTruthy()
    )
    await fireEvent.change(filter, { target: { value: '1' } })
    await waitFor(() =>
      expect(listModels).toHaveBeenLastCalledWith({ offset: 0, limit: 100, modelTagId: 1 })
    )
    expect(await screen.findByText('No models match.')).toBeTruthy()
  })

  it('opens the model a link names, and a later link opens another', async () => {
    const getModel = vi.fn(async ({ identity }: { identity: string }) =>
      detail({ identity, name: identity })
    )
    const { context, services } = harness({ listModels: async () => list([entry()]), getModel })
    services.router.navigate({
      kind: RouteKind.Models,
      model: { kind: ModelKind.Lora, identity: 'detail' }
    })
    render(ModelsView, { context })
    expect(await screen.findByRole('article', { name: 'detail details' })).toBeTruthy()
    services.router.navigate({
      kind: RouteKind.Models,
      model: { kind: ModelKind.Checkpoint, identity: 'alpha' }
    })
    expect(await screen.findByRole('article', { name: 'alpha details' })).toBeTruthy()
    expect(getModel).toHaveBeenLastCalledWith({ kind: ModelKind.Checkpoint, identity: 'alpha' })
  })

  it('shows the plain Models page for a malformed link', async () => {
    const getModel = vi.fn()
    const { context, services, hash } = harness({
      listModels: async () => list([entry()]),
      getModel
    })
    hash.change('#/models?kind=sampler&identity=detail')
    expect(services.router.route).toEqual({ kind: RouteKind.Models })
    render(ModelsView, { context })
    await screen.findByRole('list', { name: 'Models' })
    expect(getModel).not.toHaveBeenCalled()
    expect(screen.getByText(/Choose a model/)).toBeTruthy()
  })
})
