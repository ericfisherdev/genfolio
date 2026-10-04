import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RootRefreshBatcher } from './root-refresh-batcher'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const options = { delayMs: 150, maxWaitMs: 1000 }

describe('RootRefreshBatcher', () => {
  it('refreshes the roots together once reports pause', () => {
    const refresh = vi.fn()
    const batcher = new RootRefreshBatcher(refresh, options)

    batcher.add(1)
    vi.advanceTimersByTime(100)
    batcher.add(2)
    batcher.add(1)
    vi.advanceTimersByTime(149)
    expect(refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledWith(new Set([1, 2]))
  })

  it('refreshes at least every maxWaitMs while reports keep coming', () => {
    const refresh = vi.fn()
    const batcher = new RootRefreshBatcher(refresh, options)

    for (let elapsed = 0; elapsed < 1000; elapsed += 100) {
      batcher.add(1)
      vi.advanceTimersByTime(100)
    }

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('starts a new batch after a flush', () => {
    const refresh = vi.fn()
    const batcher = new RootRefreshBatcher(refresh, options)
    batcher.add(1)
    vi.advanceTimersByTime(150)
    batcher.add(2)
    vi.advanceTimersByTime(150)

    expect(refresh.mock.calls).toEqual([[new Set([1])], [new Set([2])]])
  })
})
