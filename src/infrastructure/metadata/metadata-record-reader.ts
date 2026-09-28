import { open, readFile, stat } from 'node:fs/promises'
import type { MetadataRecord } from '@domain/metadata-record'
import { ImageFormat } from '@shared/image-format'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { fileSource, type ByteSource } from './byte-source'
import { jpegExif, webpExif } from './exif-locator'
import { readExifText } from './exif-reader'
import { readPngText } from './png-text-reader'

const MAX_SIDECAR_BYTES = 1024 * 1024

/** Every metadata record in an image's bytes, by container format. Never throws. */
export async function recordsFromSource(
  source: ByteSource,
  format: ImageFormat
): Promise<MetadataRecord[]> {
  try {
    switch (format) {
      case ImageFormat.Png:
        return await readPngText(source)
      case ImageFormat.Jpeg:
        return exifRecords(await jpegExif(source))
      case ImageFormat.Webp:
        return exifRecords(await webpExif(source))
      default:
        return []
    }
  } catch {
    return []
  }
}

const exifRecords = (tiff: Uint8Array | undefined): MetadataRecord[] =>
  tiff ? readExifText(tiff) : []

/** Reads an image file's records plus an A1111 `<image>.txt` sidecar next to it, if any. */
export class MetadataRecordReader {
  async read(path: string, format: ImageFormat): Promise<MetadataRecord[]> {
    const records = await this.embedded(path, format)
    const sidecar = await this.sidecar(path)
    return sidecar ? [...records, sidecar] : records
  }

  private async embedded(path: string, format: ImageFormat): Promise<MetadataRecord[]> {
    let handle
    try {
      handle = await open(path, 'r')
    } catch {
      return []
    }
    try {
      return await recordsFromSource(await fileSource(handle), format)
    } finally {
      await handle.close()
    }
  }

  private async sidecar(imagePath: string): Promise<MetadataRecord | undefined> {
    const path = imagePath.replace(/\.[^./\\]+$/, '.txt')
    if (path === imagePath) return undefined
    try {
      const { size } = await stat(path)
      if (size > MAX_SIDECAR_BYTES) return undefined
      const text = await readFile(path)
      return { origin: MetadataOrigin.SidecarTxt, key: 'parameters', value: text.toString('utf8') }
    } catch {
      return undefined
    }
  }
}
