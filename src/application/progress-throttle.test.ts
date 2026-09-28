import { describe, expect, it } from 'vitest'
import { ProgressThrottle } from './progress-throttle'

describe('ProgressThrottle', () => {
  it('emits at most once per interval, but always emits final updates', () => {
    let now = 0
    const emitted: number[] = []
    const throttle = new ProgressThrottle<number>(
      (n) => emitted.push(n),
      100,
      () => now
    )
    throttle.report(1)
    now = 50
    throttle.report(2)
    throttle.report(3, true)
    now = 120
    throttle.report(4)
    now = 250
    throttle.report(5)
    expect(emitted).toEqual([1, 3, 5])
  })
})
