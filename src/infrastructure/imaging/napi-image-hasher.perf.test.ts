import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NapiImageHasher } from './napi-image-hasher'

const FIXTURES = resolve(__dirname, '../../../tests/fixtures/fooocus')
const ROUNDS = 5
/** Per image, decode included; ~3 h for 200k images single-threaded at this bound. */
const BUDGET_MS = 60

describe.skipIf(process.env['GENFOLIO_PERF'] !== '1')('hashing throughput', () => {
  it('hashes a full-size generated image within budget', async () => {
    const images = readdirSync(FIXTURES)
      .filter((name) => /\.(png|webp|jpe?g)$/.test(name))
      .map((name) => readFileSync(join(FIXTURES, name)))
    const hasher = new NapiImageHasher()
    for (const bytes of images) await hasher.hash(bytes)
    const started = performance.now()
    for (let round = 0; round < ROUNDS; round++) {
      for (const bytes of images) await hasher.hash(bytes)
    }
    const perImage = (performance.now() - started) / (ROUNDS * images.length)
    console.info(`[perf] hashing: ${perImage.toFixed(1)} ms per image (one at a time)`)
    expect(perImage).toBeLessThan(BUDGET_MS)
  })
})
