import type { Directory, DirectoryId, ImageFile, ImageId, LibraryRoot, RootId } from './library'

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
  /** Deletes non-root directories with no images anywhere below them. Returns how many. */
  pruneEmpty(rootId: RootId): number
}

/** What a scan compares against: the stored size and mtime of each file. */
export interface StoredFileStat {
  readonly id: ImageId
  readonly relDir: string
  readonly fileName: string
  readonly sizeBytes: number
  readonly mtimeMs: number
}

export interface ImageRepository {
  /** Inserts or updates by (directory, file name) in one transaction; `addedAt` is kept on update. */
  upsertMany(images: readonly ImageFile[], addedAt: number): void
  countByRoot(rootId: RootId): number
  fileStatsByRoot(rootId: RootId): StoredFileStat[]
  /** Deletes in one transaction; unknown ids are ignored. */
  deleteMany(ids: readonly ImageId[]): void
}
