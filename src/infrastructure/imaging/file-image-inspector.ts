import { open } from 'node:fs/promises'
import { ImageReadError } from '@domain/image-header'
import type { ImageInspection, ImageInspector } from '@domain/image-inspection'
import type { MetadataReadOptions } from '@domain/metadata-record'
import { fileSource } from '../metadata/byte-source'
import { recordsFromSource } from '../metadata/metadata-record-reader'
import { readSidecar } from '../metadata/sidecar-reader'
import type { ImageSizeHeaderReader } from './image-size-header-reader'

/**
 * Opens an image once and reads the header and the embedded metadata through the same handle
 * and the same read-ahead window, so the head of the file is read from disk once.
 */
export class FileImageInspector implements ImageInspector {
  constructor(private readonly headers: Pick<ImageSizeHeaderReader, 'fromSource'>) {}

  async inspect(path: string, options: MetadataReadOptions): Promise<ImageInspection> {
    const { header, records } = await this.readOpen(path)
    const sidecar = options.sidecar ? await readSidecar(path) : undefined
    return { header, records: sidecar ? [...records, sidecar] : records }
  }

  private async readOpen(path: string): ReturnType<ImageInspector['inspect']> {
    let handle
    try {
      handle = await open(path, 'r')
    } catch (cause) {
      throw new ImageReadError(path, { cause })
    }
    try {
      const source = await fileSource(handle).catch((cause: unknown) => {
        throw new ImageReadError(path, { cause })
      })
      const header = await this.headers.fromSource(source, path)
      return { header, records: await recordsFromSource(source, header.format) }
    } finally {
      await handle.close()
    }
  }
}
