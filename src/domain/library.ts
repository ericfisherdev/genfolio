import type { ImageFormat } from '@shared/image-format'

export type RootId = number & { readonly __brand: 'RootId' }
export type DirectoryId = number & { readonly __brand: 'DirectoryId' }
export type ImageId = number & { readonly __brand: 'ImageId' }

/** A folder the user added; everything below it is indexed. */
export interface LibraryRoot {
  readonly id: RootId
  /** Absolute, symlink-resolved path. */
  readonly path: string
  readonly addedAt: number
}

/** A folder inside a root. The root folder itself has `relPath` `''` and no parent. */
export interface Directory {
  readonly id: DirectoryId
  readonly rootId: RootId
  readonly parentId: DirectoryId | null
  /** POSIX-style path relative to the root. */
  readonly relPath: string
}

/** File facts captured at scan time. Times are epoch milliseconds. */
export interface ImageFile {
  readonly directoryId: DirectoryId
  readonly fileName: string
  readonly format: ImageFormat
  readonly sizeBytes: number
  readonly mtimeMs: number
  readonly width: number
  readonly height: number
  /** Generation time from the file name when known, otherwise `mtimeMs`. */
  readonly createdAt: number
}

export interface ImageRecord extends ImageFile {
  readonly id: ImageId
  readonly addedAt: number
}
