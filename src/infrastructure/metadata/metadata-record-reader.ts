import { open } from 'node:fs/promises'
import type { MetadataReader, MetadataReadOptions, MetadataRecord } from '@domain/metadata-record'
import { ImageFormat } from '@shared/image-format'
import { fileSource, type ByteSource } from './byte-source'
import { jpegExif, webpExif } from './exif-locator'
import { readExifText } from './exif-reader'
import { readPngText } from './png-text-reader'
import { readSidecar } from './sidecar-reader'

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
export class MetadataRecordReader implements MetadataReader {
  async read(
    path: string,
    format: ImageFormat,
    options: MetadataReadOptions = { sidecar: true }
  ): Promise<MetadataRecord[]> {
    const records = await this.embedded(path, format)
    const sidecar = options.sidecar ? await readSidecar(path) : undefined
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
}
