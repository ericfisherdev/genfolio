import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transformer } from '@napi-rs/image'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NapiImageResizer } from './napi-image-resizer'
import { encodeSolid, withExifOrientation } from './testing/synthetic-images'

let dir: string
const resizer = new NapiImageResizer()

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'genfolio-resize-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const metadataOf = (bytes: Uint8Array): ReturnType<Transformer['metadata']> =>
  new Transformer(bytes).metadata()

describe('NapiImageResizer', () => {
  it('downscales a large image to the width limit as WebP, keeping the aspect ratio', async () => {
    const path = join(dir, 'large.png')
    writeFileSync(path, await encodeSolid('png', 3000, 2000))
    const meta = await metadataOf(await resizer.resizeToWebp(path, 600))
    expect(meta).toMatchObject({ format: 'webp', width: 600, height: 400 })
  })

  it('never upscales a narrower image', async () => {
    const path = join(dir, 'small.png')
    writeFileSync(path, await encodeSolid('png', 300, 200))
    expect(await metadataOf(await resizer.resizeToWebp(path, 600))).toMatchObject({ width: 300 })
  })

  it('applies EXIF orientation before resizing', async () => {
    const path = join(dir, 'rotated.jpg')
    writeFileSync(path, withExifOrientation(await encodeSolid('jpeg', 1200, 800), 6))
    expect(await metadataOf(await resizer.resizeToWebp(path, 600))).toMatchObject({
      width: 600,
      height: 900
    })
  })
})
