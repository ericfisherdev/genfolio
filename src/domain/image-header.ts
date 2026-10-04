import type { ImageFormat } from '@shared/image-format'

/** Format and display dimensions (EXIF orientation applied) read without decoding pixels. */
export interface ImageHeader {
  readonly format: ImageFormat
  readonly width: number
  readonly height: number
}

/** The file is readable but not an image format the library indexes. */
export class UnsupportedImageError extends Error {
  constructor(readonly path: string) {
    super(`Unsupported or unrecognised image: ${path}`)
    this.name = 'UnsupportedImageError'
  }
}

/** The file could not be opened or read. */
export class ImageReadError extends Error {
  constructor(
    readonly path: string,
    options: { cause: unknown }
  ) {
    super(`Cannot read image: ${path}`, options)
    this.name = 'ImageReadError'
  }
}
