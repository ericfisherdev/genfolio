import type { ImageId } from './library'

/** Where an indexed image lives, as stored in the library. */
export interface StoredImageLocation {
  readonly rootPath: string
  /** POSIX-style, `''` for the root folder. */
  readonly relDir: string
  readonly fileName: string
  readonly width: number
  readonly height: number
  readonly mtimeMs: number
}

export interface ImageLocator {
  locate(id: ImageId): StoredImageLocation | undefined
}
