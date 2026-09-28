/** Produces an in-memory downscaled copy of an image file; nothing is written to disk. */
export interface ImageResizer {
  /** WebP bytes no wider than `maxWidth`, aspect ratio kept, EXIF orientation applied. */
  resizeToWebp(path: string, maxWidth: number): Promise<Uint8Array<ArrayBuffer>>
}
