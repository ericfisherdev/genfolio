import { describe, expect, it } from 'vitest'
import { forEachConcurrent } from './for-each-concurrent'

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1))

describe('forEachConcurrent', () => {
  it('never runs more than the limit at once and visits every item', async () => {
    let running = 0
    let peak = 0
    const visited: number[] = []
    await forEachConcurrent([1, 2, 3, 4, 5, 6, 7], 3, new AbortController().signal, async (n) => {
      peak = Math.max(peak, ++running)
      await tick()
      visited.push(n)
      running--
    })
    expect(peak).toBe(3)
    expect(visited.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('starts no further items once a task has failed', async () => {
    const started: number[] = []
    const run = forEachConcurrent(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      2,
      new AbortController().signal,
      async (n) => {
        started.push(n)
        await tick()
        if (n === 1) throw new Error('disk full')
      }
    )
    await expect(run).rejects.toThrow('disk full')
    const startedAtRejection = [...started]
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(started).toEqual(startedAtRejection)
    expect(started.length).toBeLessThanOrEqual(3)
  })

  it('stops starting items after an abort', async () => {
    const controller = new AbortController()
    const started: number[] = []
    const run = forEachConcurrent([1, 2, 3, 4], 1, controller.signal, async (n) => {
      started.push(n)
      if (n === 2) controller.abort()
      await tick()
    })
    await expect(run).rejects.toThrow()
    expect(started).toEqual([1, 2])
  })
})
