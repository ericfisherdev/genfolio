import { describe, expect, it } from 'vitest'
import { spreadPositions } from './album-positions'

describe('spreadPositions', () => {
  it('numbers from 1 in an empty album and counts on from either end', () => {
    expect(spreadPositions(undefined, undefined, 2)).toEqual([1, 2])
    expect(spreadPositions(4, undefined, 2)).toEqual([5, 6])
    expect(spreadPositions(undefined, 1, 2)).toEqual([-1, 0])
  })

  it('spreads evenly inside a gap', () => {
    expect(spreadPositions(1, 2, 3)).toEqual([1.25, 1.5, 1.75])
  })

  it('asks for a renumber once the gap has no room left', () => {
    expect(spreadPositions(1, 1 + Number.EPSILON, 1)).toBeUndefined()
    expect(spreadPositions(1, 1 + 2 * Number.EPSILON, 3)).toBeUndefined()
    expect(spreadPositions(3, 3, 1)).toBeUndefined()
  })
})
