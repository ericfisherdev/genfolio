import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ImageReadError, UnsupportedImageError } from '@domain/image-header'
import { ImageFormat } from '@shared/image-format'
import { HEADER_READ_BYTES, ImageSizeHeaderReader } from './image-size-header-reader'
import { encodeSolid, gifHeader, withExifOrientation } from './testing/synthetic-images'

const reader = new ImageSizeHeaderReader()
let dir: string

const write = (name: string, bytes: Uint8Array): string => {
  const path = join(dir, name)
  writeFileSync(path, bytes)
  return path
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'genfolio-header-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('ImageSizeHeaderReader', () => {
  it.each([
    ['png', ImageFormat.Png],
    ['jpeg', ImageFormat.Jpeg],
    ['webp', ImageFormat.Webp],
    ['webp-lossless', ImageFormat.Webp],
    ['avif', ImageFormat.Avif]
  ] as const)('reads %s dimensions', async (encoding, format) => {
    const path = write(`solid.${encoding}`, await encodeSolid(encoding, 6, 4))
    await expect(reader.read(path)).resolves.toEqual({ format, width: 6, height: 4 })
  })

  it('reads gif dimensions', async () => {
    const path = write('screen.gif', gifHeader(3, 2))
    await expect(reader.read(path)).resolves.toEqual({
      format: ImageFormat.Gif,
      width: 3,
      height: 2
    })
  })

  it('swaps dimensions for EXIF orientation 6', async () => {
    const path = write('rotated.jpg', withExifOrientation(await encodeSolid('jpeg', 6, 4), 6))
    await expect(reader.read(path)).resolves.toMatchObject({ width: 4, height: 6 })
  })

  it('falls back to the whole file when the frame header is past the header read', async () => {
    const jpeg = withExifOrientation(await encodeSolid('jpeg', 6, 4), 1, 20_000)
    expect(jpeg.indexOf(Buffer.from([0xff, 0xc0]))).toBeGreaterThan(HEADER_READ_BYTES)
    const path = write('big-exif.jpg', jpeg)
    await expect(reader.read(path)).resolves.toMatchObject({ width: 6, height: 4 })
  })

  it('rejects a truncated image as unsupported', async () => {
    const png = await encodeSolid('png', 6, 4)
    const path = write('truncated.png', png.subarray(0, 12))
    await expect(reader.read(path)).rejects.toBeInstanceOf(UnsupportedImageError)
  })

  it('rejects a text file with an image extension', async () => {
    const path = write('notes.png', Buffer.from('just some text'))
    await expect(reader.read(path)).rejects.toBeInstanceOf(UnsupportedImageError)
  })

  it('rejects a missing file with ImageReadError', async () => {
    await expect(reader.read(join(dir, 'missing.png'))).rejects.toBeInstanceOf(ImageReadError)
  })

  it('reads every committed Fooocus fixture as 1024×1024', async () => {
    const fixtures = resolve(__dirname, '../../../tests/fixtures/fooocus')
    const images = readdirSync(fixtures).filter((name) => /\.(png|webp|jpe?g)$/.test(name))
    expect(images).toHaveLength(6)
    for (const name of images) {
      await expect(reader.read(join(fixtures, name))).resolves.toMatchObject({
        width: 1024,
        height: 1024
      })
    }
  })
})
