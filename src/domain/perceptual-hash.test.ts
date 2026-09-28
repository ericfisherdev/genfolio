import { describe, expect, it } from 'vitest'
import { dHash, hamming, HASH_SOURCE_SIZE, pHash } from './perceptual-hash'

const SIZE = HASH_SOURCE_SIZE

/** A synthetic greyscale picture: smooth shapes at a given offset and brightness. */
function picture(seed: number, gain = 1, offset = 0): Uint8Array {
  const pixels = new Uint8Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const value =
        128 +
        60 * Math.sin((x + seed * 7) / (5 + seed)) +
        50 * Math.cos((y * (seed + 1)) / 9) +
        20 * Math.sin(((x + y) * seed) / 13)
      pixels[y * SIZE + x] = Math.max(0, Math.min(255, Math.round(value * gain + offset)))
    }
  }
  return pixels
}

/** The picture with light noise, as re-encoding would add. */
function noisy(source: Uint8Array, amount: number): Uint8Array {
  let state = 12345
  return source.map((value) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    const noise = ((state % 1000) / 1000 - 0.5) * 2 * amount
    return Math.max(0, Math.min(255, Math.round(value + noise)))
  })
}

describe('perceptual hashes', () => {
  it('count differing bits', () => {
    expect(hamming(0n, 0n)).toBe(0)
    expect(hamming(0b1011n, 0b0001n)).toBe(2)
    expect(hamming(-1n, 0n)).toBe(64)
  })

  it('are equal for the same pixels and close for light noise and brightness changes', () => {
    const base = picture(3)
    for (const hash of [dHash, pHash]) {
      expect(hamming(hash(base), hash(base))).toBe(0)
      expect(hamming(hash(base), hash(noisy(base, 4)))).toBeLessThanOrEqual(10)
      expect(hamming(hash(base), hash(picture(3, 0.9, 10)))).toBeLessThanOrEqual(10)
    }
  })

  it('are far apart for different pictures', () => {
    for (const hash of [dHash, pHash]) {
      expect(hamming(hash(picture(1)), hash(picture(4)))).toBeGreaterThan(10)
      expect(hamming(hash(picture(2)), hash(picture(6)))).toBeGreaterThan(10)
    }
  })

  it('fit in 64 bits', () => {
    const hashes = [dHash(picture(5)), pHash(picture(5))]
    for (const hash of hashes) {
      expect(hash >= 0n && hash < 1n << 64n).toBe(true)
    }
  })
})
