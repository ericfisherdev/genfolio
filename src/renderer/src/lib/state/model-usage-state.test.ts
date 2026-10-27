import { describe, expect, it, vi, type Mock } from 'vitest'
import { ModelKind } from '@shared/generation-kinds'
import type { ModelUsage } from '@shared/model-stats'
import { EMPTY_MODEL_FIELDS, type ModelDetail, type ModelKey } from '@shared/models'
import { ModelUsageState } from './model-usage.svelte'

type Api = ConstructorParameters<typeof ModelUsageState>[0]

const DETAIL: ModelKey = { kind: ModelKind.Lora, identity: 'detail' }
const SHARP: ModelKey = { kind: ModelKind.Lora, identity: 'sharp' }

const usageOf = (key: ModelKey, imageCount = 3): ModelUsage => ({
  model: { id: 2, ...key, name: key.identity, imageCount, tags: [] },
  loras: [],
  checkpoints: []
})

const handAdded = (key: ModelKey): ModelDetail => ({
  ...key,
  name: key.identity,
  imageCount: 0,
  hasInfo: false,
  baseModel: null,
  triggerWords: [],
  strength: null,
  tags: [{ id: 3, name: 'lighting' }],
  custom: EMPTY_MODEL_FIELDS,
  civitai: null,
  addedByHand: true
})

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => (resolve = res))
  return { promise, resolve }
}

function setup(overrides: Partial<Api> = {}): {
  state: ModelUsageState
  api: Api
  notices: { notify: Mock<(message: string) => void> }
} {
  const notices = { notify: vi.fn<(message: string) => void>() }
  const api: Api = {
    getModelUsage: vi.fn(async (key: ModelKey) => usageOf(key)),
    getModel: vi.fn(async () => null),
    ...overrides
  }
  return { state: new ModelUsageState(api, notices), api, notices }
}

describe('ModelUsageState', () => {
  it('loads the usage of the model, which is also the subject', async () => {
    const { state, api } = setup()
    await state.show(DETAIL)
    expect(api.getModelUsage).toHaveBeenCalledWith(DETAIL)
    expect(state.usage).toEqual(usageOf(DETAIL))
    expect(state.subject).toEqual(usageOf(DETAIL).model)
    expect(state.loaded).toBe(true)
    expect(api.getModel).not.toHaveBeenCalled()
  })

  it('takes the subject from the models list when no image uses the model', async () => {
    const { state, api } = setup({
      getModelUsage: vi.fn(async () => null),
      getModel: vi.fn(async (key: ModelKey) => handAdded(key))
    })
    await state.show(DETAIL)
    expect(api.getModel).toHaveBeenCalledWith(DETAIL)
    expect(state.usage).toBeUndefined()
    expect(state.subject?.tags).toEqual([{ id: 3, name: 'lighting' }])
    expect(state.loaded).toBe(true)
  })

  it('has neither usage nor subject for an unknown model', async () => {
    const { state } = setup({ getModelUsage: vi.fn(async () => null) })
    await state.show(DETAIL)
    expect(state.usage).toBeUndefined()
    expect(state.subject).toBeUndefined()
    expect(state.loaded).toBe(true)
  })

  it('forgets the previous model while the next one loads', async () => {
    const next = deferred<ModelUsage | null>()
    const getModelUsage = vi
      .fn<Api['getModelUsage']>()
      .mockResolvedValueOnce(usageOf(DETAIL))
      .mockReturnValueOnce(next.promise)
    const { state } = setup({ getModelUsage })
    await state.show(DETAIL)
    const loading = state.show(SHARP)
    expect(state.usage).toBeUndefined()
    expect(state.loaded).toBe(false)
    next.resolve(usageOf(SHARP))
    await loading
    expect(state.usage?.model.identity).toBe('sharp')
  })

  it('drops the answer of a request that a newer one has overtaken', async () => {
    const slow = deferred<ModelUsage | null>()
    const getModelUsage = vi
      .fn<Api['getModelUsage']>()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(usageOf(SHARP))
    const { state } = setup({ getModelUsage })
    const first = state.show(DETAIL)
    await state.show(SHARP)
    slow.resolve(usageOf(DETAIL))
    await first
    expect(state.usage?.model.identity).toBe('sharp')
    expect(state.loading).toBe(false)
  })

  it('reports a failure in the notice bar and marks the view failed until a load succeeds', async () => {
    const getModelUsage = vi
      .fn<Api['getModelUsage']>()
      .mockRejectedValueOnce(new Error("Error invoking remote method 'x': Error: disk is busy"))
      .mockResolvedValueOnce(usageOf(DETAIL))
    const { state, notices } = setup({ getModelUsage })
    await state.show(DETAIL)
    expect(state.failed).toBe(true)
    expect(state.loaded).toBe(false)
    expect(state.loading).toBe(false)
    expect(notices.notify).toHaveBeenCalledWith(
      'Could not load how the model is used: disk is busy'
    )
    await state.refresh()
    expect(state.failed).toBe(false)
    expect(state.usage).toEqual(usageOf(DETAIL))
  })

  it('does not load on refresh until a model has been shown, then reloads it', async () => {
    const { state, api } = setup()
    await state.refresh()
    expect(api.getModelUsage).not.toHaveBeenCalled()
    await state.show(DETAIL)
    await state.refresh()
    expect(api.getModelUsage).toHaveBeenCalledTimes(2)
    expect(api.getModelUsage).toHaveBeenLastCalledWith(DETAIL)
  })

  it('keeps showing the model while a refresh is under way', async () => {
    const { state } = setup()
    await state.show(DETAIL)
    const reloading = state.refresh()
    expect(state.usage).toEqual(usageOf(DETAIL))
    expect(state.loaded).toBe(true)
    await reloading
  })
})
