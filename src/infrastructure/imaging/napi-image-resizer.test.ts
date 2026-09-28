import { Transformer } from '@napi-rs/image'
import { describe, expect, it } from 'vitest'
import { NapiImageResizer } from './napi-image-resizer'
import { encodeSolid, withExifOrientation } from './testing/synthetic-images'

const resizer = new NapiImageResizer()

const metadataOf = (bytes: Uint8Array): ReturnType<Transformer['metadata']> =>
  new Transformer(bytes).metadata()

describe('NapiImageResizer', () => {
  it('downscales a large image to the width limit as WebP, keeping the aspect ratio', async () => {
    const meta = await metadataOf(
      await resizer.resizeToWebp(await encodeSolid('png', 3000, 2000), 600)
    )
    expect(meta).toMatchObject({ format: 'webp', width: 600, height: 400 })
  })

  it('never upscales a narrower image', async () => {
    const small = await encodeSolid('png', 300, 200)
    expect(await metadataOf(await resizer.resizeToWebp(small, 600))).toMatchObject({ width: 300 })
  })

  it('applies EXIF orientation before resizing', async () => {
    const rotated = withExifOrientation(await encodeSolid('jpeg', 1200, 800), 6)
    expect(await metadataOf(await resizer.resizeToWebp(rotated, 600))).toMatchObject({
      width: 600,
      height: 900
    })
  })
})
