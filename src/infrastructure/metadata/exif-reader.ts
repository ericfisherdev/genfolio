import { MAX_RECORD_BYTES, type MetadataRecord } from '@domain/metadata-record'
import { MetadataOrigin } from '@shared/metadata-kinds'

const TAG_IMAGE_DESCRIPTION = 0x010e
const TAG_SOFTWARE = 0x0131
const TAG_EXIF_IFD = 0x8769
const TAG_USER_COMMENT = 0x9286
const TAG_MAKER_NOTE = 0x927c

const TYPE_SIZES: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 2, 4: 4, 7: 1, 9: 4 }
const MAX_ENTRIES_PER_IFD = 512

const latin1 = new TextDecoder('latin1')
const utf8 = new TextDecoder('utf-8')
const utf16be = new TextDecoder('utf-16be')
const utf16le = new TextDecoder('utf-16le')

interface Tiff {
  readonly bytes: Uint8Array
  readonly view: DataView
  readonly littleEndian: boolean
}

/**
 * Drops trailing NULs by scanning from the end. `/\0+$/` retries from every NUL in a run that
 * isn't at the end, which is quadratic on a crafted block.
 */
function trimNuls(text: string): string {
  let end = text.length
  while (end > 0 && text.charCodeAt(end - 1) === 0) end--
  return end === text.length ? text : text.slice(0, end)
}

/**
 * Text tags from a TIFF/EXIF block (starting at its `II`/`MM` header), from IFD0 and the Exif
 * sub-IFD: Fooocus writes UserComment and MakerNote into IFD0, A1111 into the Exif IFD.
 * Keeps one record per tag (IFD0 first) and follows only the first Exif IFD pointer, so
 * entries whose offsets alias the same bytes can't multiply the output: it is bounded by
 * four records, each no larger than the block. Returns what it could read from malformed
 * data instead of throwing.
 */
export function readExifText(tiffBytes: Uint8Array): MetadataRecord[] {
  const tiff = openTiff(tiffBytes)
  if (!tiff) return []
  const ifd0Offset = tiff.view.getUint32(4, tiff.littleEndian)
  const ifd0 = entriesOf(tiff, ifd0Offset)
  const exifOffset = exifIfdOffset(
    tiff,
    ifd0.find((entry) => entry.tag === TAG_EXIF_IFD)
  )
  const exifEntries =
    exifOffset !== undefined && exifOffset !== ifd0Offset ? entriesOf(tiff, exifOffset) : []
  const records = new Map<number, MetadataRecord>()
  for (const entry of [...ifd0, ...exifEntries]) {
    if (records.has(entry.tag)) continue
    const record = toRecord(tiff, entry)
    if (record) records.set(entry.tag, record)
  }
  return [...records.values()]
}

function exifIfdOffset(tiff: Tiff, entry: Entry | undefined): number | undefined {
  const pointer = entry?.value(tiff)
  if (!pointer || pointer.length < 4) return undefined
  return new DataView(pointer.buffer, pointer.byteOffset, 4).getUint32(0, tiff.littleEndian)
}

function openTiff(bytes: Uint8Array): Tiff | undefined {
  if (bytes.length < 8) return undefined
  const order = latin1.decode(bytes.subarray(0, 2))
  if (order !== 'II' && order !== 'MM') return undefined
  const littleEndian = order === 'II'
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint16(2, littleEndian) !== 42) return undefined
  return { bytes, view, littleEndian }
}

interface Entry {
  readonly tag: number
  value(tiff: Tiff): Uint8Array | undefined
}

function entriesOf(tiff: Tiff, offset: number): Entry[] {
  const { view, bytes, littleEndian } = tiff
  if (offset < 8 || offset + 2 > bytes.length) return []
  const count = Math.min(view.getUint16(offset, littleEndian), MAX_ENTRIES_PER_IFD)
  const entries: Entry[] = []
  for (let index = 0; index < count; index++) {
    const at = offset + 2 + index * 12
    if (at + 12 > bytes.length) break
    const tag = view.getUint16(at, littleEndian)
    const type = view.getUint16(at + 2, littleEndian)
    const itemCount = view.getUint32(at + 4, littleEndian)
    entries.push({
      tag,
      value: () => {
        const size = (TYPE_SIZES[type] ?? 0) * itemCount
        if (size === 0 || size > MAX_RECORD_BYTES) return undefined
        const start = size <= 4 ? at + 8 : view.getUint32(at + 8, littleEndian)
        if (start + size > bytes.length) return undefined
        return bytes.subarray(start, start + size)
      }
    })
  }
  return entries
}

const TEXT_TAGS: ReadonlyMap<number, { origin: MetadataOrigin; key: string }> = new Map([
  [TAG_IMAGE_DESCRIPTION, { origin: MetadataOrigin.ExifImageDescription, key: 'ImageDescription' }],
  [TAG_SOFTWARE, { origin: MetadataOrigin.ExifSoftware, key: 'Software' }],
  [TAG_USER_COMMENT, { origin: MetadataOrigin.ExifUserComment, key: 'UserComment' }],
  [TAG_MAKER_NOTE, { origin: MetadataOrigin.ExifMakerNote, key: 'MakerNote' }]
])

function toRecord(tiff: Tiff, entry: Entry): MetadataRecord | undefined {
  const tag = TEXT_TAGS.get(entry.tag)
  if (!tag) return undefined
  const raw = entry.value(tiff)
  if (!raw) return undefined
  const value =
    entry.tag === TAG_USER_COMMENT ? decodeUserComment(raw, tiff.littleEndian) : decodeText(raw)
  return value.length > 0 ? { origin: tag.origin, key: tag.key, value } : undefined
}

/** ASCII/UNDEFINED tag bytes: UTF-8 when valid, otherwise latin-1. */
function decodeText(raw: Uint8Array): string {
  try {
    return trimNuls(new TextDecoder('utf-8', { fatal: true }).decode(raw))
  } catch {
    return trimNuls(latin1.decode(raw))
  }
}

/**
 * UserComment: an 8-byte charset code (`ASCII`, `UNICODE`, `JIS`, or 8 NULs for undefined)
 * then the text. Fooocus writes no code at all, so unknown prefixes are treated as text.
 * UNICODE follows the TIFF byte order (A1111's piexif writes big-endian `MM`).
 */
export function decodeUserComment(raw: Uint8Array, littleEndian: boolean): string {
  const code = latin1.decode(raw.subarray(0, 8))
  const body = raw.subarray(8)
  if (code === 'UNICODE\0') return trimNuls((littleEndian ? utf16le : utf16be).decode(body))
  if (code === 'ASCII\0\0\0') return trimNuls(latin1.decode(body))
  if (code === '\0\0\0\0\0\0\0\0') return trimNuls(utf8.decode(body))
  if (code.startsWith('JIS')) return ''
  return decodeText(raw)
}
