import { describe, expect, it } from 'vitest'
import { groupSimilar, popcount32, splitHash } from './similarity'

describe('popcount32 and splitHash', () => {
  it('count bits in each half of a 64-bit hash', () => {
    expect(popcount32(0)).toBe(0)
    expect(popcount32(0xffffffff)).toBe(32)
    expect(popcount32(0b1011)).toBe(3)
    const { hi, lo } = splitHash(-1n)
    expect(popcount32(hi) + popcount32(lo)).toBe(64)
    expect(splitHash(1n << 40n)).toEqual({ hi: 1 << 8, lo: 0 })
  })
})

describe('groupSimilar', () => {
  it('groups images linked within the threshold under their smallest id', () => {
    const groups = groupSimilar(
      [
        { a: 1, b: 2, distance: 0 },
        { a: 2, b: 5, distance: 3 },
        { a: 1, b: 5, distance: 4 },
        { a: 7, b: 9, distance: 12 }
      ],
      10
    )
    expect(Object.fromEntries(groups)).toEqual({ 1: 1, 2: 1, 5: 1 })
  })

  it('does not chain: A~B and B~C stay apart when A and C are not close', () => {
    const chain = [
      { a: 1, b: 2, distance: 6 },
      { a: 2, b: 3, distance: 7 }
    ]
    expect(Object.fromEntries(groupSimilar(chain, 10))).toEqual({ 1: 1, 2: 1 })
    const closed = [...chain, { a: 1, b: 3, distance: 9 }]
    expect(Object.fromEntries(groupSimilar(closed, 10))).toEqual({ 1: 1, 2: 1, 3: 1 })
  })

  it('regroups at another threshold', () => {
    const pairs = [
      { a: 1, b: 2, distance: 2 },
      { a: 3, b: 4, distance: 8 }
    ]
    expect(groupSimilar(pairs, 4).size).toBe(2)
    expect(groupSimilar(pairs, 10).size).toBe(4)
  })
})
