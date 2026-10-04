import type { MetadataReadOptions, MetadataRecord } from '@domain/metadata-record'
import { FileImageInspector } from '../../imaging/file-image-inspector'
import { ImageSizeHeaderReader } from '../../imaging/image-size-header-reader'

const inspector = new FileImageInspector(new ImageSizeHeaderReader())

/** The records the scan would read from an image file, sidecar included unless declined. */
export async function recordsOfFile(
  path: string,
  options: MetadataReadOptions = { sidecar: true }
): Promise<MetadataRecord[]> {
  return (await inspector.inspect(path, options)).records
}
