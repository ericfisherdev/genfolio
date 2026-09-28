import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
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

  /**
   * The sidecar, read through one handle so the size check holds at read time: never more
   * than MAX_SIDECAR_BYTES + 1 bytes, and only from a regular file. O_NONBLOCK keeps open
   * from waiting on a FIFO (it changes nothing for regular files).
   */
  private async sidecar(imagePath: string): Promise<MetadataRecord | undefined> {
    const path = imagePath.replace(/\.[^./\\]+$/, '.txt')
    if (path === imagePath) return undefined
    let handle: FileHandle | undefined
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
      const stats = await handle.stat()
      if (!stats.isFile() || stats.size > MAX_SIDECAR_BYTES) return undefined
      const buffer = Buffer.alloc(MAX_SIDECAR_BYTES + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > MAX_SIDECAR_BYTES) return undefined
      return {
        origin: MetadataOrigin.SidecarTxt,
        key: 'parameters',
        value: buffer.toString('utf8', 0, bytesRead)
      }
    } catch {
      return undefined
    } finally {
      await handle?.close()
    }
  }
}
