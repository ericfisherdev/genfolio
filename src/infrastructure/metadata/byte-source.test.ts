import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { fileSource } from './byte-source'
import { readPngText } from './png-text-reader'
import { pngChunk, tEXt } from './testing/metadata-builders'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const IDAT_CHUNK_BYTES = 64 * 1024

/** A PNG the way Pillow writes it: ~64 KB IDAT chunks, then the text chunk. */
function pngWithTextAfterImageData(idatChunks: number): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    ...Array.from({ length: idatChunks }, (_, i) =>
      pngChunk('IDAT', Buffer.alloc(IDAT_CHUNK_BYTES, i))
    ),
    tEXt('parameters', 'a prompt after the image data'),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

let dir: string
let path: string
let bytes: Buffer

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'genfolio-source-'))
  path = join(dir, 'big.png')
  bytes = pngWithTextAfterImageData(22)
  writeFileSync(path, bytes)
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** The handle, counting how often the file is actually read. */
function counted(handle: FileHandle): { handle: FileHandle; reads: () => number } {
  let reads = 0
  const wrapper = {
    stat: () => handle.stat(),
    read: (...args: Parameters<FileHandle['read']>) => {
      reads++
      return (handle.read as (...a: unknown[]) => Promise<unknown>)(...args)
    }
  }
  return { handle: wrapper as unknown as FileHandle, reads: () => reads }
}

describe('fileSource', () => {
  it('finds text after the image data of a 1.4 MB PNG in a handful of reads, not one per chunk', async () => {
    const file = await open(path, 'r')
    try {
      const { handle, reads } = counted(file)
      const records = await readPngText(await fileSource(handle))
      expect(records).toEqual([
        {
          origin: MetadataOrigin.PngText,
          key: 'parameters',
          value: 'a prompt after the image data'
        }
      ])
      expect(reads()).toBeLessThanOrEqual(8)
    } finally {
      await file.close()
    }
  })

  it('returns the same bytes as the file for reads inside, across and beyond its windows', async () => {
    const file = await open(path, 'r')
    try {
      const source = await fileSource(file)
      expect(source.size).toBe(bytes.length)
      const reads: [number, number][] = [
        [0, 8],
        [8, 25],
        [0, 64 * 1024],
        [60_000, 10_000],
        [70_000, 8],
        [70_004, 300_000],
        [100_000, 8],
        [300_000, 262_144],
        [bytes.length - 5, 100],
        [bytes.length, 10],
        [bytes.length + 100, 10]
      ]
      for (const [offset, length] of reads) {
        const expected = bytes.subarray(offset, Math.min(bytes.length, offset + length))
        expect(Buffer.from(await source.read(offset, length))).toEqual(expected)
      }
    } finally {
      await file.close()
    }
  })
})
