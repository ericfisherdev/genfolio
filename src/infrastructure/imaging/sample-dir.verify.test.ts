import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Transformer } from '@napi-rs/image'
import { describe, expect, it } from 'vitest'
import { ImageSizeHeaderReader } from './image-size-header-reader'

// Local-only check against a folder of real images. Skipped unless GENFOLIO_SAMPLE_DIR is set,
// so it never runs in CI and the folder is never named in the repository.
const sampleDir = process.env['GENFOLIO_SAMPLE_DIR']

function imagesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|avif|gif)$/i.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
}

describe.skipIf(!sampleDir)('ImageSizeHeaderReader against GENFOLIO_SAMPLE_DIR', () => {
  it('matches a full decode for every image', async () => {
    const reader = new ImageSizeHeaderReader()
    const mismatches: string[] = []
    const images = imagesUnder(sampleDir as string)
    for (const path of images) {
      const header = await reader.read(path)
      const decoded = await new Transformer(await readFile(path)).metadata()
      if (header.width !== decoded.width || header.height !== decoded.height) mismatches.push(path)
    }
    expect(images.length).toBeGreaterThan(0)
    expect(mismatches).toEqual([])
  }, 120_000)
})
