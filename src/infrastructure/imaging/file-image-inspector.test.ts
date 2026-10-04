import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ImageReadError, UnsupportedImageError } from '@domain/image-header'
import { ImageFormat } from '@shared/image-format'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { MetadataRecordReader } from '../metadata/metadata-record-reader'
import { FileImageInspector } from './file-image-inspector'
import { ImageSizeHeaderReader } from './image-size-header-reader'

const FIXTURES = resolve(__dirname, '../../../tests/fixtures/fooocus')
const headers = new ImageSizeHeaderReader()
const inspector = new FileImageInspector(headers)
let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'genfolio-inspect-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

const imageNames = readdirSync(FIXTURES).filter((name) => /\.(png|webp|jpe?g)$/.test(name))

describe('FileImageInspector', () => {
  it.each(imageNames)(
    'reads the header and records of %s as the separate readers do',
    async (name) => {
      const path = join(FIXTURES, name)
      const header = await headers.read(path)
      const inspection = await inspector.inspect(path, { sidecar: false })
      expect(inspection.header).toEqual(header)
      expect(inspection.records).toEqual(
        await new MetadataRecordReader().read(path, header.format, { sidecar: false })
      )
    }
  )

  it('adds the sidecar after the embedded records only when asked', async () => {
    const path = join(dir, 'x.png')
    cpSync(join(FIXTURES, imageNames.find((name) => name.endsWith('.png')) ?? ''), path)
    writeFileSync(join(dir, 'x.txt'), 'a cat\nSteps: 20')

    const without = await inspector.inspect(path, { sidecar: false })
    const withSidecar = await inspector.inspect(path, { sidecar: true })

    expect(without.records.some((r) => r.origin === MetadataOrigin.SidecarTxt)).toBe(false)
    expect(withSidecar.records.slice(0, -1)).toEqual(without.records)
    expect(withSidecar.records.at(-1)).toEqual({
      origin: MetadataOrigin.SidecarTxt,
      key: 'parameters',
      value: 'a cat\nSteps: 20'
    })
    expect(withSidecar.header.format).toBe(ImageFormat.Png)
  })

  it('rejects a file that is not an image as unsupported and a missing one as unreadable', async () => {
    const path = join(dir, 'notes.png')
    writeFileSync(path, 'just some text')
    await expect(inspector.inspect(path, { sidecar: false })).rejects.toBeInstanceOf(
      UnsupportedImageError
    )
    await expect(
      inspector.inspect(join(dir, 'missing.png'), { sidecar: false })
    ).rejects.toBeInstanceOf(ImageReadError)
  })
})
