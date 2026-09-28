import { crc32, deflateSync } from 'node:zlib'

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const latin1 = (text: string): Buffer => Buffer.from(text, 'latin1')

/** A PNG chunk with a valid CRC over its type and data. */
export function pngChunk(type: string, data: Uint8Array): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32BE(data.length, 0)
  header.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])))
  return Buffer.concat([header, data, crc])
}

/** The same chunk with its last CRC byte flipped. */
export function withBadCrc(chunk: Buffer): Buffer {
  const copy = Buffer.from(chunk)
  const last = copy.length - 1
  copy.writeUInt8(copy.readUInt8(last) ^ 0xff, last)
  return copy
}

export const tEXt = (key: string, value: string): Buffer =>
  pngChunk('tEXt', Buffer.concat([latin1(key), Buffer.of(0), latin1(value)]))

export const zTXt = (key: string, value: string): Buffer =>
  pngChunk('zTXt', Buffer.concat([latin1(key), Buffer.of(0, 0), deflateSync(latin1(value))]))

export function iTXt(key: string, value: string, compressed = false): Buffer {
  const text = compressed ? deflateSync(Buffer.from(value, 'utf8')) : Buffer.from(value, 'utf8')
  return pngChunk(
    'iTXt',
    Buffer.concat([
      latin1(key),
      Buffer.of(0, compressed ? 1 : 0, 0),
      Buffer.of(0),
      Buffer.of(0),
      text
    ])
  )
}

/** Minimal PNG: signature, IHDR, the given chunks placed before or after IDAT, IEND. */
export function png(before: Buffer[], after: Buffer[] = []): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    ...before,
    pngChunk('IDAT', deflateSync(Buffer.alloc(4))),
    ...after,
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

interface TiffEntry {
  readonly tag: number
  /** 2 = ASCII, 7 = UNDEFINED, 4 = LONG */
  readonly type: number
  readonly data: Buffer
}

/** A TIFF block with IFD0 entries and optionally an Exif sub-IFD, in either byte order. */
export function tiff(ifd0: TiffEntry[], exifIfd: TiffEntry[] = [], littleEndian = false): Buffer {
  const u16 = (value: number): Buffer => {
    const b = Buffer.alloc(2)
    if (littleEndian) b.writeUInt16LE(value)
    else b.writeUInt16BE(value)
    return b
  }
  const u32 = (value: number): Buffer => {
    const b = Buffer.alloc(4)
    if (littleEndian) b.writeUInt32LE(value)
    else b.writeUInt32BE(value)
    return b
  }
  const ifdSize = (count: number): number => 2 + count * 12 + 4
  const ifd0Entries =
    exifIfd.length > 0 ? [...ifd0, { tag: 0x8769, type: 4, data: Buffer.alloc(4) }] : ifd0
  const ifd0Offset = 8
  const exifOffset = ifd0Offset + ifdSize(ifd0Entries.length)
  let dataOffset = exifOffset + (exifIfd.length > 0 ? ifdSize(exifIfd.length) : 0)
  const blobs: Buffer[] = []
  const encode = (entries: TiffEntry[]): Buffer => {
    const parts: Buffer[] = [u16(entries.length)]
    for (const entry of entries) {
      const pointer = entry.tag === 0x8769
      const size = pointer ? 4 : entry.data.length
      parts.push(u16(entry.tag), u16(entry.type), u32(pointer ? 1 : size))
      if (pointer) parts.push(u32(exifOffset))
      else if (size <= 4) parts.push(Buffer.concat([entry.data, Buffer.alloc(4 - size)]))
      else {
        parts.push(u32(dataOffset))
        blobs.push(entry.data)
        dataOffset += size
      }
    }
    parts.push(u32(0))
    return Buffer.concat(parts)
  }
  const header = Buffer.concat([
    Buffer.from(littleEndian ? 'II' : 'MM', 'latin1'),
    u16(42),
    u32(ifd0Offset)
  ])
  const first = encode(ifd0Entries)
  const second = exifIfd.length > 0 ? encode(exifIfd) : Buffer.alloc(0)
  return Buffer.concat([header, first, second, ...blobs])
}

export const unicodeComment = (text: string, littleEndian = false): Buffer => {
  const body = Buffer.from(text, 'utf16le')
  if (!littleEndian) body.swap16()
  return Buffer.concat([Buffer.from('UNICODE\0', 'latin1'), body])
}

/** JPEG with the TIFF block in an APP1 Exif segment. */
export function jpegWithExif(tiffBlock: Buffer): Buffer {
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiffBlock])
  const length = Buffer.alloc(2)
  length.writeUInt16BE(payload.length + 2)
  return Buffer.concat([
    Buffer.of(0xff, 0xd8, 0xff, 0xe1),
    length,
    payload,
    Buffer.of(0xff, 0xda, 0, 2, 0xff, 0xd9)
  ])
}

/** WebP with an EXIF chunk (optionally carrying the Exif\0\0 header some writers add). */
export function webpWithExif(tiffBlock: Buffer, withHeader = false): Buffer {
  const data = withHeader
    ? Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiffBlock])
    : tiffBlock
  const chunk = (id: string, body: Buffer): Buffer => {
    const header = Buffer.alloc(8)
    header.write(id, 0, 'latin1')
    header.writeUInt32LE(body.length, 4)
    return Buffer.concat([header, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)])
  }
  const body = Buffer.concat([
    Buffer.from('WEBP', 'latin1'),
    chunk('VP8 ', Buffer.alloc(10)),
    chunk('EXIF', data)
  ])
  const riff = Buffer.alloc(8)
  riff.write('RIFF', 0, 'latin1')
  riff.writeUInt32LE(body.length, 4)
  return Buffer.concat([riff, body])
}
