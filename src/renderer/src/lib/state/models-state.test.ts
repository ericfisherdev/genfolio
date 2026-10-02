import { describe, expect, it, vi } from 'vitest'
import { ChangeOutcome } from '@shared/change-outcome'
import { ModelKind } from '@shared/generation-kinds'
import { EMPTY_MODEL_FIELDS, type ModelDetail, type ModelEntry } from '@shared/models'
import { ModelsState } from './models.svelte'

const entry = (n: number): ModelEntry => ({
  kind: ModelKind.Lora,
  identity: `m${n}`,
  name: `m${n}`,
  imageCount: 1,
  hasInfo: false,
  baseModel: null,
  triggerWords: [],
  strength: null
})

const TOTAL = 450

/** A library of TOTAL models, served as the real service does: at most 200 per request. */
function libraryApi(): ConstructorParameters<typeof ModelsState>[0] {
  return {
    listModels: vi.fn(async ({ offset, limit }) => ({
      total: TOTAL,
      items: Array.from({ length: Math.min(limit, TOTAL - offset) }, (_, n) => entry(offset + n)),
      baseModels: []
    })),
    getModel: vi.fn(),
    saveModel: vi.fn(async (key) => ({
      outcome: ChangeOutcome.Done as const,
      model: { ...entry(0), ...key, custom: EMPTY_MODEL_FIELDS, civitai: null } as ModelDetail
    })),
    createModel: vi.fn(),
    clearModel: vi.fn(),
    copyModelTriggerWords: vi.fn(),
    lookupModelOnCivitai: vi.fn(),
    searchCivitai: vi.fn(),
    linkModelToCivitai: vi.fn(),
    refreshModelFromCivitai: vi.fn(),
    unlinkModelFromCivitai: vi.fn(),
    openModelOnCivitai: vi.fn()
  }
}

describe('ModelsState', () => {
  it('keeps every model that was shown when a save reloads the list, even past one request', async () => {
    const api = libraryApi()
    const state = new ModelsState(api, { notify: vi.fn() })
    await state.load()
    await state.loadMore()
    await state.loadMore()
    expect(state.items).toHaveLength(300)
    await state.save(
      { kind: ModelKind.Lora, identity: 'm250' },
      { baseModel: null, triggerWords: [], strength: null, description: null, notes: 'x' }
    )
    expect(state.items).toHaveLength(300)
    expect(state.items.at(-1)?.identity).toBe('m299')
    expect(state.total).toBe(TOTAL)
  })

  it('starts again from the first page when the filters change', async () => {
    const state = new ModelsState(libraryApi(), { notify: vi.fn() })
    await state.load()
    await state.loadMore()
    await state.filter({ text: 'm' })
    expect(state.items).toHaveLength(100)
  })
})
