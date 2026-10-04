import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ImageReadError, UnsupportedImageError } from '@domain/image-header'
import { ImageFormat } from '@shared/image-format'
import { memorySource } from '../metadata/byte-source'
import { HEADER_READ_BYTES, ImageSizeHeaderReader } from './image-size-header-reader'
import { encodeSolid, gifHeader, withExifOrientation } from './testing/synthetic-images'

const headers = new ImageSizeHeaderReader()
const reader = {
  read: async (path: string) => headers.fromSource(memorySource(readFileSync(path)), path)
}
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

  it('rejects a large non-JPEG it cannot parse without reading the whole file', async () => {
    const path = write('large-garbage.png', Buffer.alloc(HEADER_READ_BYTES * 3, 0x41))
    const readAll = vi.spyOn(ImageSizeHeaderReader.prototype as never, 'readAll')
    await expect(reader.read(path)).rejects.toBeInstanceOf(UnsupportedImageError)
    expect(readAll).not.toHaveBeenCalled()
  })

  it('rejects a source that cannot be read with ImageReadError', async () => {
    const failing = {
      size: 10,
      read: async () => {
        throw new Error('I/O error')
      }
    }
    await expect(headers.fromSource(failing, 'x.png')).rejects.toBeInstanceOf(ImageReadError)
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
