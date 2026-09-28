import { describe, expect, it, vi, type Mock } from 'vitest'
import type { ImageId } from '@domain/library'
import { ScanEventType } from '@shared/scan'
import { HashingQueue } from './hashing-queue'

interface Pass {
  readonly resolve: (ids: ImageId[]) => void
  readonly signal: AbortSignal
}

type Run = (
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void
) => Promise<ImageId[]>

/** An indexer whose passes finish when the test says so. */
function controllable(): { indexer: { run: Mock<Run> }; passes: Pass[] } {
  const passes: Pass[] = []
  const indexer = {
    run: vi.fn<Run>(
      (signal, onProgress) =>
        new Promise<ImageId[]>((resolve, reject) => {
          onProgress(0, 2)
          signal.addEventListener('abort', () => reject(signal.reason))
          passes.push({ resolve, signal })
        })
    )
  }
  return { indexer, passes }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('HashingQueue', () => {
  it('runs one pass at a time and queues exactly one more', async () => {
    const { indexer, passes } = controllable()
    const emit = vi.fn()
    const onHashed = vi.fn()
    const queue = new HashingQueue(indexer, emit, onHashed, vi.fn())
    queue.request()
    queue.request()
    queue.request()
    expect(indexer.run).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith({ type: ScanEventType.Hashing, done: 0, total: 2 })
    passes[0]?.resolve([1 as ImageId])
    await settle()
    expect(onHashed).toHaveBeenCalledWith([1])
    expect(indexer.run).toHaveBeenCalledTimes(2)
    passes[1]?.resolve([])
    await settle()
    expect(indexer.run).toHaveBeenCalledTimes(2)
    expect(onHashed).toHaveBeenCalledTimes(1)
  })

  it('stops the running pass without reporting it as an error, and forgets a queued one', async () => {
    const { indexer } = controllable()
    const onError = vi.fn()
    const queue = new HashingQueue(indexer, vi.fn(), vi.fn(), onError)
    queue.request()
    queue.request()
    await queue.stop()
    await settle()
    expect(indexer.run).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports a pass that failed on its own', async () => {
    const onError = vi.fn()
    const failing = { run: vi.fn(async () => Promise.reject(new Error('disk I/O error'))) }
    new HashingQueue(failing, vi.fn(), vi.fn(), onError).request()
    await settle()
    expect(onError).toHaveBeenCalledWith(new Error('disk I/O error'))
  })
})
