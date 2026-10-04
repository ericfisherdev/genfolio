import type { MetadataRecord } from '@domain/metadata-record'
import { ImageFormat } from '@shared/image-format'
import type { ByteSource } from './byte-source'
import { jpegExif, webpExif } from './exif-locator'
import { readExifText } from './exif-reader'
import { readPngText } from './png-text-reader'

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
