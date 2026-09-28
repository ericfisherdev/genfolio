import { createHash } from 'node:crypto'
import { ResizeFilterType, ResizeFit, Transformer } from '@napi-rs/image'
import { dHash, HASH_SOURCE_SIZE, pHash } from '@domain/perceptual-hash'
import type { ImageHasher, ImageHashes } from '@domain/image-hashes'

const PIXELS = HASH_SOURCE_SIZE * HASH_SOURCE_SIZE

/**
 * Hashes image bytes: SHA-256 of the file, and dHash and pHash of one decode, oriented,
 * greyscale and resized to 64×64 in memory (nothing is written to disk).
 */
export class NapiImageHasher implements ImageHasher {
  async hash(bytes: Uint8Array): Promise<ImageHashes> {
    const sha256 = createHash('sha256').update(bytes).digest()
    const raw = await new Transformer(bytes)
      .rotate()
      .grayscale()
      .resize({
        width: HASH_SOURCE_SIZE,
        height: HASH_SOURCE_SIZE,
        filter: ResizeFilterType.Triangle,
        fit: ResizeFit.Fill
      })
      .rawPixels()
    const luma = toLuma8(raw)
    return { sha256, dhash: dHash(luma), phash: pHash(luma) }
  }
}

/**
 * 8-bit luma from whatever the greyscale decode produced: 8- or 16-bit luma (16-bit is native
 * little-endian, so the high byte is the second), 8- or 16-bit RGB(A) of equal channels, or
 * 32-bit float RGB(A).
 */
export function toLuma8(raw: Uint8Array): Uint8Array {
  const bytesPerPixel = raw.length / PIXELS
  const luma = new Uint8Array(PIXELS)
  const floats =
    bytesPerPixel >= 12 ? new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4) : undefined
  for (let pixel = 0; pixel < PIXELS; pixel++) {
    const at = pixel * bytesPerPixel
    switch (bytesPerPixel) {
      case 1:
      case 3:
      case 4:
        luma[pixel] = raw[at] ?? 0
        break
      case 2:
      case 6:
      case 8:
        luma[pixel] = raw[at + 1] ?? 0
        break
      default:
        luma[pixel] = Math.round(
          Math.min(1, Math.max(0, floats?.[pixel * (bytesPerPixel / 4)] ?? 0)) * 255
        )
    }
  }
  return luma
}
