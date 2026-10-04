import type { MetadataOrigin } from '@shared/metadata-kinds'

/** One piece of text an image carries, before any interpretation. */
export interface MetadataRecord {
  readonly origin: MetadataOrigin
  /** PNG keyword, or the EXIF tag name. */
  readonly key: string
  readonly value: string
}

/** Records bigger than this are skipped (a generation's text is a few KB). */
export const MAX_RECORD_BYTES = 16 * 1024 * 1024

export interface MetadataReadOptions {
  /** Whether to look for an A1111 `<stem>.txt` beside the image. */
  readonly sidecar: boolean
}

/**
 * Bump when extraction or parsing changes so already-indexed images are re-read: a scan treats
 * rows indexed at an older version as changed.
 */
export const METADATA_INDEX_VERSION = 1
