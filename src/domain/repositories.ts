import type { Directory, DirectoryId, ImageFile, LibraryRoot, RootId } from './library'

/** Thrown when adding a root whose path is already registered. */
export class DuplicateRootError extends Error {
  constructor(readonly path: string) {
    super(`Library root already exists: ${path}`)
    this.name = 'DuplicateRootError'
  }
}

export interface LibraryRootRepository {
  /** Throws {@link DuplicateRootError} when `path` is already a root. */
  add(path: string, addedAt: number): LibraryRoot
  list(): LibraryRoot[]
  /** Removes the root and, by cascade, its directories and images. Returns false when absent. */
  remove(id: RootId): boolean
}

export interface DirectoryRepository {
  /** Returns the directory for `relPath`, creating it and any missing ancestors. */
  ensure(rootId: RootId, relPath: string): DirectoryId
  listByRoot(rootId: RootId): Directory[]
}

export interface ImageRepository {
  /** Inserts or updates by (directory, file name) in one transaction; `addedAt` is kept on update. */
  upsertMany(images: readonly ImageFile[], addedAt: number): void
  countByRoot(rootId: RootId): number
}
