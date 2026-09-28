import type { ByteSource } from './byte-source'

const MAX_EXIF_BYTES = 1024 * 1024
const latin1 = new TextDecoder('latin1')
const EXIF_HEADER = 'Exif\0\0'

const withoutExifHeader = (bytes: Uint8Array): Uint8Array =>
  latin1.decode(bytes.subarray(0, 6)) === EXIF_HEADER ? bytes.subarray(6) : bytes

/** The TIFF block of a JPEG's APP1 Exif segment; stops at the start of scan data. */
export async function jpegExif(source: ByteSource): Promise<Uint8Array | undefined> {
  const start = await source.read(0, 2)
  if (start[0] !== 0xff || start[1] !== 0xd8) return undefined
  let offset = 2
  while (offset + 4 <= source.size) {
    const header = await source.read(offset, 4)
    if (header[0] !== 0xff) return undefined
    const marker = header[1] ?? 0
    if (marker === 0xda || marker === 0xd9) return undefined
    const length = ((header[2] ?? 0) << 8) | (header[3] ?? 0)
    if (length < 2) return undefined
    if (marker === 0xe1 && length - 2 <= MAX_EXIF_BYTES) {
      const segment = await source.read(offset + 4, length - 2)
      if (latin1.decode(segment.subarray(0, 6)) === EXIF_HEADER) return segment.subarray(6)
    }
    offset += 2 + length
  }
  return undefined
}

/** The TIFF block of a WebP's RIFF `EXIF` chunk (with or without an `Exif\0\0` header). */
export async function webpExif(source: ByteSource): Promise<Uint8Array | undefined> {
  const riff = await source.read(0, 12)
  if (
    latin1.decode(riff.subarray(0, 4)) !== 'RIFF' ||
    latin1.decode(riff.subarray(8, 12)) !== 'WEBP'
  ) {
    return undefined
  }
  let offset = 12
  while (offset + 8 <= source.size) {
    const header = await source.read(offset, 8)
    if (header.length < 8) return undefined
    const id = latin1.decode(header.subarray(0, 4))
    const size = new DataView(header.buffer, header.byteOffset, 8).getUint32(4, true)
    if (id === 'EXIF' && size <= MAX_EXIF_BYTES) {
      return withoutExifHeader(await source.read(offset + 8, size))
    }
    offset += 8 + size + (size % 2)
  }
  return undefined
}
