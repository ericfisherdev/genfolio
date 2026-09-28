import { Transformer } from '@napi-rs/image'

export type EncodableFormat = 'png' | 'jpeg' | 'webp' | 'webp-lossless' | 'avif'

/** A solid image of the given size encoded with `@napi-rs/image`. */
export async function encodeSolid(
  format: EncodableFormat,
  width: number,
  height: number
): Promise<Buffer> {
  const source = Transformer.fromRgbaPixels(
    new Uint8Array(width * height * 4).fill(180),
    width,
    height
  )
  switch (format) {
    case 'png':
      return source.png()
    case 'jpeg':
      return source.jpeg()
    case 'webp':
      return source.webp(80)
    case 'webp-lossless':
      return source.webpLossless()
    case 'avif':
      return source.avif()
  }
}

/** A minimal GIF89a whose logical screen is `width`×`height`. */
export function gifHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(13)
  header.write('GIF89a', 0, 'ascii')
  header.writeUInt16LE(width, 6)
  header.writeUInt16LE(height, 8)
  return Buffer.concat([header, Buffer.from([0x3b])])
}

function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head.writeUInt16BE(marker, 0)
  head.writeUInt16BE(payload.length + 2, 2)
  return Buffer.concat([head, payload])
}

/** Big-endian TIFF block with a single Orientation (0x0112) entry, padded to `paddedLength`. */
function exifWithOrientation(orientation: number, paddedLength: number): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 12 + 4)
  tiff.write('MM', 0, 'ascii')
  tiff.writeUInt16BE(42, 2)
  tiff.writeUInt32BE(8, 4)
  tiff.writeUInt16BE(1, 8)
  tiff.writeUInt16BE(0x0112, 10)
  tiff.writeUInt16BE(3, 12)
  tiff.writeUInt32BE(1, 14)
  tiff.writeUInt16BE(orientation, 18)
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff])
  return Buffer.concat([body, Buffer.alloc(Math.max(0, paddedLength - body.length))])
}

/**
 * Inserts an EXIF APP1 with `orientation` right after SOI, plus `extraPaddingBytes` of APP2
 * segments, so the frame header (SOF) can be pushed past any header-read limit.
 */
export function withExifOrientation(
  jpeg: Buffer,
  orientation: number,
  extraPaddingBytes = 0
): Buffer {
  const app1 = segment(0xffe1, exifWithOrientation(orientation, extraPaddingBytes > 0 ? 60_000 : 0))
  const padding: Buffer[] = []
  for (let remaining = extraPaddingBytes; remaining > 0; remaining -= 60_000) {
    padding.push(segment(0xffe2, Buffer.alloc(Math.min(remaining, 60_000))))
  }
  return Buffer.concat([jpeg.subarray(0, 2), app1, ...padding, jpeg.subarray(2)])
}
