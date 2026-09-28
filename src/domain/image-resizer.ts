/** Produces an in-memory downscaled copy of image bytes; nothing is written to disk. */
export interface ImageResizer {
  /** WebP bytes no wider than `maxWidth`, aspect ratio kept, EXIF orientation applied. */
  resizeToWebp(source: Uint8Array, maxWidth: number): Promise<Uint8Array<ArrayBuffer>>
}
