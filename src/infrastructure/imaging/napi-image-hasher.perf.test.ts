import { readdirSync, readFileSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NapiImageHasher } from './napi-image-hasher'

const FIXTURES = resolve(__dirname, '../../../tests/fixtures/fooocus')
const ROUNDS = 5
/** Per image, decode included; ~3 h for 200k images single-threaded at this bound. */
const BUDGET_MS = 60
/** What one request waiting behind the hashing pass may be held up for. */
const BLOCKED_LOOP_BUDGET_MS = 25

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

  it('keeps the event loop free while hashing eight images at once', async () => {
    const images = readdirSync(FIXTURES)
      .filter((name) => /\.(png|webp|jpe?g)$/.test(name))
      .map((name) => readFileSync(join(FIXTURES, name)))
    const hasher = new NapiImageHasher()
    const delay = monitorEventLoopDelay({ resolution: 1 })
    delay.enable()
    for (let round = 0; round < ROUNDS; round++) {
      await Promise.all(
        Array.from({ length: 8 }, (_, i) => hasher.hash(images[i % images.length] as Buffer))
      )
    }
    delay.disable()
    const maxMs = delay.max / 1e6
    console.info(`[perf] hashing: longest event-loop stall ${maxMs.toFixed(1)} ms`)
    expect(maxMs).toBeLessThan(BLOCKED_LOOP_BUDGET_MS)
  })
})
