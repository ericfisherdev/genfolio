import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MAX_RECORD_BYTES } from '@domain/metadata-record'
import { ImageFormat } from '@shared/image-format'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { memorySource } from './byte-source'
import { readExifText } from './exif-reader'
import { recordsOfFile } from './testing/read-records'
import { recordsFromSource } from './source-records'
import { readPngText } from './png-text-reader'
import {
  aliasedTiff,
  iTXt,
  jpegWithExif,
  png,
  tEXt,
  tiff,
  unicodeComment,
  webpWithExif,
  withBadCrc,
  zTXt
} from './testing/metadata-builders'

const FIXTURES = resolve(__dirname, '../../../tests/fixtures/fooocus')
const formatOf = (name: string): ImageFormat =>
  name.endsWith('.png')
    ? ImageFormat.Png
    : name.endsWith('.webp')
      ? ImageFormat.Webp
      : ImageFormat.Jpeg

async function fixtureRecords(name: string): Promise<[string, string, number][]> {
  const records = await recordsOfFile(join(FIXTURES, name))
  return records.map((record) => [record.origin, record.key, record.value.length])
}

describe('committed Fooocus fixtures', () => {
  it.each([
    [
      '2026-09-27_20-36-27_8675.png',
      [
        [MetadataOrigin.PngText, 'parameters', 2147],
        [MetadataOrigin.PngText, 'fooocus_scheme', 7]
      ]
    ],
    [
      '2026-09-27_20-38-19_1754.png',
      [
        [MetadataOrigin.PngText, 'parameters', 2049],
        [MetadataOrigin.PngText, 'fooocus_scheme', 5]
      ]
    ],
    [
      '2026-09-27_20-43-28_2563.webp',
      [
        [MetadataOrigin.ExifSoftware, 'Software', 21],
        [MetadataOrigin.ExifMakerNote, 'MakerNote', 5],
        [MetadataOrigin.ExifUserComment, 'UserComment', 1455]
      ]
    ],
    [
      '2026-09-27_20-45-48_2563.webp',
      [
        [MetadataOrigin.ExifSoftware, 'Software', 21],
        [MetadataOrigin.ExifMakerNote, 'MakerNote', 7],
        [MetadataOrigin.ExifUserComment, 'UserComment', 2690]
      ]
    ],
    ['2026-09-27_20-47-27_2563.png', []],
    [
      '2026-09-27_20-48-56_2563.jpeg',
      [
        [MetadataOrigin.ExifSoftware, 'Software', 21],
        [MetadataOrigin.ExifMakerNote, 'MakerNote', 5],
        [MetadataOrigin.ExifUserComment, 'UserComment', 1862]
      ]
    ]
  ])('%s', async (name, expected) => {
    expect(await fixtureRecords(name)).toEqual(expected)
  })

  it('keeps the non-ASCII prompt intact in PNG text and shows Fooocus EXIF mangling as-is', async () => {
    const pngRecords = await recordsOfFile(join(FIXTURES, '2026-09-27_20-38-19_1754.png'))
    expect(pngRecords[0]?.value).toContain('café')
    const webp = await recordsOfFile(join(FIXTURES, '2026-09-27_20-43-28_2563.webp'))
    expect(webp.find((r) => r.key === 'UserComment')?.value).toContain('caf? table')
  })
})

describe('readPngText', () => {
  it('reads tEXt, zTXt and iTXt, including text written after IDAT', async () => {
    const bytes = png(
      [tEXt('parameters', 'latin prompt'), zTXt('zipped', 'compressed latin')],
      [iTXt('late', '桜 petals'), iTXt('late-zipped', 'café 桜', true)]
    )
    const records = await readPngText(memorySource(bytes))
    expect(records.map((r) => [r.key, r.value])).toEqual([
      ['parameters', 'latin prompt'],
      ['zipped', 'compressed latin'],
      ['late', '桜 petals'],
      ['late-zipped', 'café 桜']
    ])
  })

  it('skips a text chunk whose CRC does not match and keeps reading', async () => {
    const bytes = png([withBadCrc(tEXt('corrupt', 'x')), tEXt('parameters', 'kept')])
    const records = await readPngText(memorySource(bytes))
    expect(records.map((r) => r.key)).toEqual(['parameters'])
  })

  it('skips compressed text that would inflate past the record limit', async () => {
    const bomb = 'a'.repeat(MAX_RECORD_BYTES + 1)
    const bytes = png([
      zTXt('bomb', bomb),
      iTXt('bomb-itxt', bomb, true),
      tEXt('parameters', 'kept')
    ])
    const records = await readPngText(memorySource(bytes))
    expect(records.map((r) => r.key)).toEqual(['parameters'])
  })

  it('caps the text decoded from all chunks of one image together', async () => {
    const nearlyFull = 'a'.repeat(MAX_RECORD_BYTES - 1)
    const bytes = png(
      [zTXt('one', nearlyFull), zTXt('two', nearlyFull), iTXt('three', nearlyFull, true)],
      [tEXt('four', 'late')]
    )
    const records = await readPngText(memorySource(bytes))
    const total = records.reduce((sum, record) => sum + record.value.length, 0)
    expect(total).toBeLessThanOrEqual(MAX_RECORD_BYTES)
    expect(records.map((r) => r.key)).toEqual(['one'])
  })

  it('ignores non-PNG input', async () => {
    expect(await readPngText(memorySource(Buffer.from('not a png')))).toEqual([])
  })
})

describe('readExifText', () => {
  const comment = (tiffBlock: Buffer): string | undefined =>
    readExifText(tiffBlock).find((r) => r.origin === MetadataOrigin.ExifUserComment)?.value

  it('decodes an A1111 UNICODE UserComment from the Exif sub-IFD (big-endian)', () => {
    const block = tiff([], [{ tag: 0x9286, type: 7, data: unicodeComment('桜, café\nSteps: 20') }])
    expect(comment(block)).toBe('桜, café\nSteps: 20')
  })

  it('follows a little-endian TIFF for UNICODE', () => {
    const block = tiff([], [{ tag: 0x9286, type: 7, data: unicodeComment('little', true) }], true)
    expect(comment(block)).toBe('little')
  })

  it('decodes ASCII-prefixed and prefix-less (Fooocus IFD0) comments', () => {
    const ascii = tiff([
      { tag: 0x9286, type: 7, data: Buffer.from('ASCII\0\0\0plain text', 'latin1') }
    ])
    expect(comment(ascii)).toBe('plain text')
    const fooocus = tiff([
      { tag: 0x9286, type: 7, data: Buffer.from('{"prompt": "x"}', 'utf8') },
      { tag: 0x927c, type: 7, data: Buffer.from('fooocus') },
      { tag: 0x0131, type: 2, data: Buffer.from('Fooocus v2.5.5\0') }
    ])
    expect(readExifText(fooocus).map((r) => [r.key, r.value])).toEqual([
      ['UserComment', '{"prompt": "x"}'],
      ['MakerNote', 'fooocus'],
      ['Software', 'Fooocus v2.5.5']
    ])
  })

  it('keeps one record per tag however many entries alias the same bytes', () => {
    const block = aliasedTiff(512, 512, Buffer.alloc(50_000, 0x61))
    const records = readExifText(block)
    expect(records).toHaveLength(1)
    expect(records[0]?.value).toHaveLength(50_000)
  })

  it('ignores an Exif IFD pointer back at IFD0', () => {
    const block = tiff([
      { tag: 0x9286, type: 7, data: Buffer.from('once') },
      { tag: 0x8769, type: 4, data: Buffer.alloc(4) }
    ])
    const pointerValueAt = 8 + 2 + 12 + 8 // second IFD0 entry's value field
    block.writeUInt32BE(8, pointerValueAt)
    expect(readExifText(block).map((r) => r.value)).toEqual(['once'])
  })

  it('trims trailing NULs and keeps interior ones, in linear time', () => {
    const block = tiff([
      { tag: 0x010e, type: 2, data: Buffer.from(`${'\0'.repeat(200_000)}x\0\0`, 'latin1') }
    ])
    const started = performance.now()
    const value = readExifText(block)[0]?.value
    expect(performance.now() - started).toBeLessThan(500)
    expect(value).toBe(`${'\0'.repeat(200_000)}x`)
  })

  it('reads ImageDescription (UnFooocused)', () => {
    const block = tiff([{ tag: 0x010e, type: 2, data: Buffer.from('a prompt\nSteps: 30\0') }])
    expect(readExifText(block)).toEqual([
      {
        origin: MetadataOrigin.ExifImageDescription,
        key: 'ImageDescription',
        value: 'a prompt\nSteps: 30'
      }
    ])
  })
})

describe('container locators', () => {
  const block = tiff([{ tag: 0x9286, type: 7, data: Buffer.from('in the container') }])

  it.each([
    ['JPEG APP1', jpegWithExif(block), ImageFormat.Jpeg],
    ['WebP EXIF', webpWithExif(block), ImageFormat.Webp],
    ['WebP EXIF with an Exif header', webpWithExif(block, true), ImageFormat.Webp]
  ])('finds the EXIF block in %s', async (_, bytes, format) => {
    const records = await recordsFromSource(memorySource(bytes), format)
    expect(records.map((r) => r.value)).toEqual(['in the container'])
  })
})

describe('sidecar text', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'genfolio-sidecar-'))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('adds an A1111 <image>.txt next to the image', async () => {
    writeFileSync(join(dir, 'a.png'), png([]))
    writeFileSync(join(dir, 'a.txt'), 'sidecar prompt\nSteps: 20')
    const records = await recordsOfFile(join(dir, 'a.png'))
    expect(records).toEqual([
      { origin: MetadataOrigin.SidecarTxt, key: 'parameters', value: 'sidecar prompt\nSteps: 20' }
    ])
  })

  it('ignores a directory or FIFO named like a sidecar without blocking', async () => {
    writeFileSync(join(dir, 'c.png'), png([]))
    mkdirSync(join(dir, 'c.txt'))
    expect(await recordsOfFile(join(dir, 'c.png'))).toEqual([])
    writeFileSync(join(dir, 'd.png'), png([]))
    execFileSync('mkfifo', [join(dir, 'd.txt')])
    expect(await recordsOfFile(join(dir, 'd.png'))).toEqual([])
  }, 5000)

  it('skips a sidecar over 1 MB', async () => {
    writeFileSync(join(dir, 'b.png'), png([]))
    writeFileSync(join(dir, 'b.txt'), 'x'.repeat(1024 * 1024 + 1))
    expect(await recordsOfFile(join(dir, 'b.png'))).toEqual([])
  })
})

describe('robustness', () => {
  it('never throws on truncated fixtures', async () => {
    for (const name of readdirSync(FIXTURES).filter((n) => /\.(png|webp|jpeg)$/.test(n))) {
      const bytes = readFileSync(join(FIXTURES, name))
      for (let cut = 0; cut < bytes.length; cut += Math.max(1, Math.floor(bytes.length / 97))) {
        await expect(
          recordsFromSource(memorySource(bytes.subarray(0, cut)), formatOf(name))
        ).resolves.toBeInstanceOf(Array)
      }
    }
  })

  it('survives random byte corruption of every fixture', async () => {
    let seed = 7
    const random = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    for (const name of readdirSync(FIXTURES).filter((n) => /\.(png|webp|jpeg)$/.test(n))) {
      const original = readFileSync(join(FIXTURES, name))
      for (let round = 0; round < 20; round++) {
        const bytes = Buffer.from(original.subarray(0, 8192))
        for (let flips = 0; flips < 16; flips++)
          bytes[Math.floor(random() * bytes.length)] = Math.floor(random() * 256)
        await expect(
          recordsFromSource(memorySource(bytes), formatOf(name))
        ).resolves.toBeInstanceOf(Array)
      }
    }
  })
})
