import { describe, expect, it, vi, type Mock } from 'vitest'
import { ModelKind } from '@shared/generation-kinds'
import type { ModelStatsOverview } from '@shared/model-stats'
import { ModelStatsState } from './model-stats.svelte'

type Api = ConstructorParameters<typeof ModelStatsState>[0]

const overview = (name: string): ModelStatsOverview => ({
  checkpoints: [
    { id: 1, kind: ModelKind.Checkpoint, identity: name, name, imageCount: 3, tags: [] }
  ],
  loras: [],
  checkpointLoraPairs: [],
  loraPairs: []
})

const EMPTY: ModelStatsOverview = {
  checkpoints: [],
  loras: [],
  checkpointLoraPairs: [],
  loraPairs: []
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(getModelStats: Api['getModelStats'] = vi.fn(async () => EMPTY)): {
  state: ModelStatsState
  getModelStats: Api['getModelStats']
  notices: { notify: Mock<(message: string) => void> }
} {
  const notices = { notify: vi.fn<(message: string) => void>() }
  return { state: new ModelStatsState({ getModelStats }, notices), getModelStats, notices }
}

describe('ModelStatsState', () => {
  it('loads the whole-library overview without a query, and with the tag when one is chosen', async () => {
    const getModelStats = vi.fn(async () => overview('alpha'))
    const { state } = setup(getModelStats)
    await state.show(undefined)
    expect(getModelStats).toHaveBeenLastCalledWith(undefined)
    expect(state.overview).toEqual(overview('alpha'))
    expect(state.loading).toBe(false)

    await state.show(3)
    expect(getModelStats).toHaveBeenLastCalledWith({ modelTagId: 3 })
    expect(state.modelTagId).toBe(3)
  })

  it('drops the answer of a request that a newer one has overtaken', async () => {
    const slow = deferred<ModelStatsOverview>()
    const getModelStats = vi
      .fn<Api['getModelStats']>()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(overview('newer'))
    const { state } = setup(getModelStats)
    const first = state.show(1)
    await state.show(2)
    expect(state.overview).toEqual(overview('newer'))
    slow.resolve(overview('older'))
    await first
    expect(state.overview).toEqual(overview('newer'))
    expect(state.modelTagId).toBe(2)
  })

  it('stays loading until the newest request answers', async () => {
    const older = deferred<ModelStatsOverview>()
    const newer = deferred<ModelStatsOverview>()
    const getModelStats = vi
      .fn<Api['getModelStats']>()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const { state } = setup(getModelStats)
    const first = state.show(1)
    const second = state.show(2)
    older.resolve(EMPTY)
    await first
    expect(state.loading).toBe(true)
    newer.resolve(EMPTY)
    await second
    expect(state.loading).toBe(false)
  })

  it('reports a failure in the notice bar and marks the page failed until a load succeeds', async () => {
    const getModelStats = vi
      .fn<Api['getModelStats']>()
      .mockRejectedValueOnce(
        new Error("Error invoking remote method 'x': Error: database is locked")
      )
      .mockResolvedValueOnce(overview('alpha'))
    const { state, notices } = setup(getModelStats)
    await state.show(undefined)
    expect(state.failed).toBe(true)
    expect(state.loading).toBe(false)
    expect(notices.notify).toHaveBeenCalledWith(
      'Could not load the model statistics: database is locked'
    )
    await state.refresh()
    expect(state.failed).toBe(false)
    expect(state.overview).toEqual(overview('alpha'))
  })

  it('does not load on refresh until the overview has been shown', async () => {
    const { state, getModelStats } = setup()
    await state.refresh()
    expect(getModelStats).not.toHaveBeenCalled()
    await state.show(undefined)
    await state.refresh()
    expect(getModelStats).toHaveBeenCalledTimes(2)
  })

  it('keeps the chosen tag when refreshing', async () => {
    const { state, getModelStats } = setup()
    await state.show(4)
    await state.refresh()
    expect(getModelStats).toHaveBeenLastCalledWith({ modelTagId: 4 })
  })
})
