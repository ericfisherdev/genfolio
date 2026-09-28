import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transformer } from '@napi-rs/image'
import { describe, expect, it } from 'vitest'
import type { ImageLocator } from '@domain/image-location'
import type { ImageId } from '@domain/library'
import { NapiImageResizer } from '@infrastructure/imaging/napi-image-resizer'
import { ByteLruCache } from './byte-lru-cache'
import { ConcurrencyLimiter } from './concurrency-limiter'
import { DisplayCopies } from './display-copies'
import { ImageFileResolver } from './image-file-resolver'

describe.skipIf(process.env['GENFOLIO_PERF'] !== '1')('DisplayCopies under load', () => {
  it('serves 20 concurrent 4096² copies while the cache stays within budget', async () => {
    const dir = await realpath(mkdtempSync(join(tmpdir(), 'genfolio-copies-')))
    try {
      for (let i = 1; i <= 20; i++) {
        const pixels = new Uint8Array(4096 * 4096 * 4).map((_, j) => (j * i) % 251)
        writeFileSync(
          join(dir, `${i}.png`),
          await Transformer.fromRgbaPixels(pixels, 4096, 4096).png()
        )
      }
      const locator: ImageLocator = {
        locate: (id) => ({
          rootPath: dir,
          relDir: '',
          fileName: `${id}.png`,
          width: 4096,
          height: 4096,
          mtimeMs: 1
        })
      }
      const budget = 256 * 1024
      const cache = new ByteLruCache<string>(budget)
      const copies = new DisplayCopies(
        new ImageFileResolver(locator, realpath),
        new NapiImageResizer(),
        cache,
        new ConcurrencyLimiter(4)
      )
      const started = performance.now()
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => copies.render((i + 1) as ImageId, 600))
      )
      console.info(`[perf] 20 copies in ${(performance.now() - started).toFixed(0)} ms`)
      expect(results.every((copy) => copy !== null && copy.byteLength > 0)).toBe(true)
      expect(cache.bytes).toBeLessThanOrEqual(budget)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 180_000)
})
