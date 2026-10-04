import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ResizeFilterType, Transformer } from '@napi-rs/image'
import { describe, expect, it } from 'vitest'
import { hamming } from '@domain/perceptual-hash'
import { NapiImageHasher, toLuma8 } from './napi-image-hasher'

const FIXTURES = resolve(__dirname, '../../../tests/fixtures/fooocus')
const fixtures = readdirSync(FIXTURES)
  .filter((name) => /\.(png|webp|jpe?g)$/.test(name))
  .map((name) => readFileSync(join(FIXTURES, name)))
const hasher = new NapiImageHasher()

const distance = (
  a: { dhash: bigint; phash: bigint },
  b: { dhash: bigint; phash: bigint }
): number => Math.max(hamming(a.dhash, b.dhash), hamming(a.phash, b.phash))

describe('NapiImageHasher', () => {
  it('keeps a resized or re-encoded copy within 10 bits and tells the bytes apart', async () => {
    for (const bytes of fixtures) {
      const original = await hasher.hash(bytes)
      const { width } = await new Transformer(bytes).metadata()
      const resized = await new Transformer(bytes)
        .resize({ width: Math.round(width / 2), filter: ResizeFilterType.Lanczos3 })
        .png()
      const reencoded = await new Transformer(bytes).jpeg(80)
      for (const copy of [resized, reencoded]) {
        const hashed = await hasher.hash(copy)
        expect(distance(original, hashed)).toBeLessThanOrEqual(10)
        expect(Buffer.from(hashed.sha256).equals(Buffer.from(original.sha256))).toBe(false)
      }
    }
  })

  it('keeps different generations of one prompt more than 10 bits apart', async () => {
    const hashes = await Promise.all(fixtures.map((bytes) => hasher.hash(bytes)))
    for (let a = 0; a < hashes.length; a++) {
      for (let b = a + 1; b < hashes.length; b++) {
        const [first, second] = [hashes[a], hashes[b]]
        if (first && second) expect(distance(first, second)).toBeGreaterThan(10)
      }
    }
  })

  it('takes the SHA-256 of the file bytes, as a 32-byte Buffer a database can store', async () => {
    for (const bytes of fixtures) {
      const { sha256 } = await hasher.hash(bytes)
      expect(Buffer.isBuffer(sha256)).toBe(true)
      expect(sha256).toEqual(createHash('sha256').update(bytes).digest())
    }
  })

  it('rejects bytes that are not an image', async () => {
    await expect(hasher.hash(new Uint8Array([1, 2, 3]))).rejects.toThrow()
  })
})

describe('toLuma8', () => {
  it('reads 8-bit and 16-bit luma and float RGB', () => {
    const pixels = 64 * 64
    expect(toLuma8(new Uint8Array(pixels).fill(7))[0]).toBe(7)
    const wide = new Uint8Array(pixels * 2)
    wide[1] = 200
    expect(toLuma8(wide)[0]).toBe(200)
    const floats = new Float32Array(pixels * 3).fill(0.5)
    expect(toLuma8(new Uint8Array(floats.buffer))[0]).toBe(128)
  })
})
