import { describe, expect, it } from 'vitest'
import { ConcurrencyLimiter } from './concurrency-limiter'

describe('ConcurrencyLimiter', () => {
  it('never runs more than the limit at once and runs every task', async () => {
    const limiter = new ConcurrencyLimiter(2)
    let running = 0
    let peak = 0
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        limiter.run(async () => {
          peak = Math.max(peak, ++running)
          await new Promise((resolve) => setTimeout(resolve, 2))
          running--
          return i
        })
      )
    )
    expect(peak).toBe(2)
    expect(results).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('frees the slot when a task fails', async () => {
    const limiter = new ConcurrencyLimiter(1)
    await expect(limiter.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(limiter.run(async () => 'next')).resolves.toBe('next')
  })

  it('hands a freed slot to the queued task before any newcomer', async () => {
    const limiter = new ConcurrencyLimiter(1)
    let running = 0
    let peak = 0
    const timed = async (): Promise<void> => {
      peak = Math.max(peak, ++running)
      await new Promise((resolve) => setTimeout(resolve, 2))
      running--
    }
    let releaseA: () => void = () => undefined
    const taskA = new Promise<void>((resolve) => (releaseA = resolve))
    const a = limiter.run(() => taskA)
    const b = limiter.run(timed)
    // Scheduled on taskA itself, so it runs right after A's slot is freed and before the
    // woken B resumes: exactly when a newcomer could steal the slot.
    let c: Promise<void> | undefined
    void taskA.then(() => {
      c = limiter.run(timed)
    })
    releaseA()
    await Promise.all([a, b])
    await c
    expect(peak).toBe(1)
  })
})
