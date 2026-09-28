import { crc32, inflateSync } from 'node:zlib'
import { MAX_RECORD_BYTES, type MetadataRecord } from '@domain/metadata-record'
import { MetadataOrigin } from '@shared/metadata-kinds'
import type { ByteSource } from './byte-source'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const TEXT_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt'])
const latin1 = new TextDecoder('latin1')
const utf8 = new TextDecoder('utf-8')

/**
 * Every tEXt, zTXt and iTXt chunk in a PNG, wherever it appears (Pillow and A1111 may write
 * text after IDAT). Only chunk headers and text chunks are read; image data is skipped.
 * Stops quietly at truncated data and returns what it read; a text chunk whose CRC doesn't
 * match is skipped. Compressed text may inflate to at most MAX_RECORD_BYTES.
 */
export async function readPngText(source: ByteSource): Promise<MetadataRecord[]> {
  const signature = await source.read(0, 8)
  if (!PNG_SIGNATURE.every((byte, index) => signature[index] === byte)) return []
  const records: MetadataRecord[] = []
  let offset = 8
  while (offset + 12 <= source.size) {
    const header = await source.read(offset, 8)
    if (header.length < 8) break
    const length = new DataView(header.buffer, header.byteOffset, 8).getUint32(0)
    const type = latin1.decode(header.subarray(4, 8))
    const dataStart = offset + 8
    if (dataStart + length + 4 > source.size) break
    if (TEXT_CHUNKS.has(type) && length <= MAX_RECORD_BYTES) {
      const record = await readTextChunk(source, offset, length)
      if (record) records.push(record)
    }
    if (type === 'IEND') break
    offset = dataStart + length + 4
  }
  return records
}

/** Reads type + data + CRC in one go and decodes the chunk if its CRC matches. */
async function readTextChunk(
  source: ByteSource,
  chunkOffset: number,
  length: number
): Promise<MetadataRecord | undefined> {
  const chunk = await source.read(chunkOffset + 4, length + 8)
  const typeAndData = chunk.subarray(0, length + 4)
  const storedCrc = new DataView(chunk.buffer, chunk.byteOffset + length + 4, 4).getUint32(0)
  if (crc32(typeAndData) !== storedCrc) return undefined
  return decodeTextChunk(latin1.decode(chunk.subarray(0, 4)), chunk.subarray(4, length + 4))
}

const inflate = (bytes: Uint8Array): Buffer =>
  inflateSync(bytes, { maxOutputLength: MAX_RECORD_BYTES })

function decodeTextChunk(type: string, data: Uint8Array): MetadataRecord | undefined {
  try {
    switch (type) {
      case 'tEXt':
        return keywordRecord(data, (rest) => latin1.decode(rest))
      case 'zTXt':
        return keywordRecord(data, (rest) => latin1.decode(inflate(rest.subarray(1))))
      default:
        return internationalRecord(data)
    }
  } catch {
    return undefined
  }
}

/** keyword NUL rest */
function keywordRecord(
  data: Uint8Array,
  decodeRest: (rest: Uint8Array) => string
): MetadataRecord | undefined {
  const nul = data.indexOf(0)
  if (nul <= 0) return undefined
  return {
    origin: MetadataOrigin.PngText,
    key: latin1.decode(data.subarray(0, nul)),
    value: decodeRest(data.subarray(nul + 1))
  }
}

/** keyword NUL compressed-flag method language NUL translated-keyword NUL text */
function internationalRecord(data: Uint8Array): MetadataRecord | undefined {
  const keywordEnd = data.indexOf(0)
  if (keywordEnd <= 0 || keywordEnd + 3 > data.length) return undefined
  const compressed = data[keywordEnd + 1] === 1
  const languageEnd = data.indexOf(0, keywordEnd + 3)
  if (languageEnd < 0) return undefined
  const translatedEnd = data.indexOf(0, languageEnd + 1)
  if (translatedEnd < 0) return undefined
  const text = data.subarray(translatedEnd + 1)
  return {
    origin: MetadataOrigin.PngText,
    key: latin1.decode(data.subarray(0, keywordEnd)),
    value: utf8.decode(compressed ? inflate(text) : text)
  }
}
