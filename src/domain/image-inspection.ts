import type { ImageHeader } from './image-header'
import type { MetadataReadOptions, MetadataRecord } from './metadata-record'

/** What a scan learns from one image file. */
export interface ImageInspection {
  readonly header: ImageHeader
  /** The raw metadata records, including an A1111 sidecar when asked for. */
  readonly records: MetadataRecord[]
}

/** Reads an image's header and metadata records from a single opening of the file. */
export interface ImageInspector {
  /**
   * Rejects with `UnsupportedImageError` or `ImageReadError` when the header cannot be read
   * or parsed. Reading metadata never fails: malformed data yields what could be read.
   */
  inspect(path: string, options: MetadataReadOptions): Promise<ImageInspection>
}
