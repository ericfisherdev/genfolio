import { describe, expect, it } from 'vitest'
import type { ImageId } from './library'
import { HashTable } from './hash-table'
import { groupSimilar, type SimilarPair } from './similarity'

const IMAGES = 200_000
/** One new image against every hashed one, on the reference machine. */
const COMPARE_BUDGET_MS = 5

function randomHash(next: () => number): bigint {
  return (BigInt(next() >>> 0) << 32n) | BigInt(next() >>> 0)
}

describe.skipIf(process.env['GENFOLIO_PERF'] !== '1')('similarity at 200k images', () => {
  it('compares one image with every other within budget and regroups', () => {
    let state = 99
    const next = (): number => {
      state = (Math.imul(state, 1103515245) + 12345) | 0
      return state
    }
    const hashes = Array.from({ length: IMAGES }, (_, index) => ({
      id: (index + 1) as ImageId,
      sha256: null,
      dhash: randomHash(next),
      phash: randomHash(next)
    }))
    // Every 50th image gets a near copy (2 bits off), as re-encodes would be.
    for (let index = 0; index < IMAGES; index += 50) {
      const original = hashes[index]
      const copy = hashes[index + 1]
      if (original && copy) {
        hashes[index + 1] = { ...copy, dhash: original.dhash ^ 3n, phash: original.phash ^ 3n }
      }
    }
    const built = performance.now()
    const table = new HashTable(hashes)
    const buildMs = performance.now() - built

    const started = performance.now()
    const rounds = 20
    for (let round = 0; round < rounds; round++) table.pairsOf(round * 50 + 1, 16, () => false)
    const compareMs = (performance.now() - started) / rounds

    const pairs: SimilarPair[] = []
    for (let index = 0; index < IMAGES; index += 50)
      pairs.push({ a: index + 1, b: index + 2, distance: 2 })
    const grouped = performance.now()
    const groups = groupSimilar(pairs, 10)
    const groupMs = performance.now() - grouped

    console.info(
      `[perf] similarity: table ${buildMs.toFixed(0)} ms, one comparison ${compareMs.toFixed(2)} ms, ` +
        `grouping ${pairs.length} pairs ${groupMs.toFixed(1)} ms`
    )
    expect(groups.size).toBe(pairs.length * 2)
    expect(compareMs).toBeLessThan(COMPARE_BUDGET_MS)
  })
})
