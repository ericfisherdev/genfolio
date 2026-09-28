import { crc32, inflateSync } from 'node:zlib'
import { MAX_RECORD_BYTES, type MetadataRecord } from '@domain/metadata-record'
import { MetadataOrigin } from '@shared/metadata-kinds'
import type { ByteSource } from './byte-source'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const TEXT_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt'])
const latin1 = new TextDecoder('latin1')
const utf8 = new TextDecoder('utf-8')

/** Decoded text bytes kept per image. A cap per chunk alone doesn't bound the total. */
const MAX_PNG_TEXT_BYTES = MAX_RECORD_BYTES

/**
 * The text bytes one image may still decode. Plain text spends its own length; compressed
 * text may inflate only to what is left, so no mix of chunks can exceed the total.
 */
class TextBudget {
  constructor(private remaining: number) {}

  get left(): number {
    return this.remaining
  }

  /** `bytes`, inflated when `compressed`, or `undefined` once they don't fit. Throws on bad zlib data. */
  spend(bytes: Uint8Array, compressed: boolean): Uint8Array | undefined {
    const text = compressed ? inflateSync(bytes, { maxOutputLength: this.remaining }) : bytes
    if (text.length > this.remaining) return undefined
    this.remaining -= text.length
    return text
  }
}

/**
 * Every tEXt, zTXt and iTXt chunk in a PNG, wherever it appears (Pillow and A1111 may write
 * text after IDAT). Only chunk headers and text chunks are read; image data is skipped.
 * Stops quietly at truncated data and returns what it read; a text chunk whose CRC doesn't
 * match is skipped. All text together, decompressed, is capped at MAX_PNG_TEXT_BYTES.
 */
export async function readPngText(source: ByteSource): Promise<MetadataRecord[]> {
  const signature = await source.read(0, 8)
  if (!PNG_SIGNATURE.every((byte, index) => signature[index] === byte)) return []
  const records: MetadataRecord[] = []
  const budget = new TextBudget(MAX_PNG_TEXT_BYTES)
  let offset = 8
  while (offset + 12 <= source.size && budget.left > 0) {
    const header = await source.read(offset, 8)
    if (header.length < 8) break
    const length = new DataView(header.buffer, header.byteOffset, 8).getUint32(0)
    const type = latin1.decode(header.subarray(4, 8))
    const dataStart = offset + 8
    if (dataStart + length + 4 > source.size) break
    if (TEXT_CHUNKS.has(type) && length <= budget.left) {
      const record = await readTextChunk(source, offset, length, budget)
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
  length: number,
  budget: TextBudget
): Promise<MetadataRecord | undefined> {
  const chunk = await source.read(chunkOffset + 4, length + 8)
  const typeAndData = chunk.subarray(0, length + 4)
  const storedCrc = new DataView(chunk.buffer, chunk.byteOffset + length + 4, 4).getUint32(0)
  if (crc32(typeAndData) !== storedCrc) return undefined
  const type = latin1.decode(chunk.subarray(0, 4))
  return decodeTextChunk(type, chunk.subarray(4, length + 4), budget)
}

function decodeTextChunk(
  type: string,
  data: Uint8Array,
  budget: TextBudget
): MetadataRecord | undefined {
  try {
    switch (type) {
      case 'tEXt':
        return keywordRecord(data, (rest) => budget.spend(rest, false))
      case 'zTXt':
        return keywordRecord(data, (rest) => budget.spend(rest.subarray(1), true))
      default:
        return internationalRecord(data, budget)
    }
  } catch {
    return undefined
  }
}

/** keyword NUL rest (latin-1) */
function keywordRecord(
  data: Uint8Array,
  textOf: (rest: Uint8Array) => Uint8Array | undefined
): MetadataRecord | undefined {
  const nul = data.indexOf(0)
  if (nul <= 0) return undefined
  const text = textOf(data.subarray(nul + 1))
  if (!text) return undefined
  return {
    origin: MetadataOrigin.PngText,
    key: latin1.decode(data.subarray(0, nul)),
    value: latin1.decode(text)
  }
}

/** keyword NUL compressed-flag method language NUL translated-keyword NUL text (UTF-8) */
function internationalRecord(data: Uint8Array, budget: TextBudget): MetadataRecord | undefined {
  const keywordEnd = data.indexOf(0)
  if (keywordEnd <= 0 || keywordEnd + 3 > data.length) return undefined
  const compressed = data[keywordEnd + 1] === 1
  const languageEnd = data.indexOf(0, keywordEnd + 3)
  if (languageEnd < 0) return undefined
  const translatedEnd = data.indexOf(0, languageEnd + 1)
  if (translatedEnd < 0) return undefined
  const text = budget.spend(data.subarray(translatedEnd + 1), compressed)
  if (!text) return undefined
  return {
    origin: MetadataOrigin.PngText,
    key: latin1.decode(data.subarray(0, keywordEnd)),
    value: utf8.decode(text)
  }
}
