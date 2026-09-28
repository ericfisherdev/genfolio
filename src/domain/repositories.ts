import type { StoredGeneration } from './generation'
import type { Directory, DirectoryId, ImageFile, ImageId, LibraryRoot, RootId } from './library'
import type { MetadataRecord } from './metadata-record'

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
  findById(id: RootId): LibraryRoot | undefined
  /** Removes the root and, by cascade, its directories and images. Returns false when absent. */
  remove(id: RootId): boolean
}

export interface DirectoryRepository {
  /** Returns the directory for `relPath`, creating it and any missing ancestors. */
  ensure(rootId: RootId, relPath: string): DirectoryId
  listByRoot(rootId: RootId): Directory[]
  /**
   * Moves every directory (and so every image) of root `from` under `prefix` in root `to`,
   * creating `prefix`'s ancestors in `to`. `to` must have nothing at or below `prefix`.
   */
  moveRoot(from: RootId, to: RootId, prefix: string): void
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
  /**
   * Deletes, in one transaction, each row that still has the size and mtime in `stats`;
   * rows another writer changed since the snapshot survive.
   */
  deleteMany(stats: readonly StoredFileStat[]): void
}

export interface GenerationRepository {
  /**
   * In one transaction: upserts the checkpoint, refiner and LoRA models (reused by name
   * identity, collecting new hashes) and replaces the image's generation and LoRA links.
   * `null` removes the generation.
   */
  replace(imageId: ImageId, generation: StoredGeneration | null): void
  find(imageId: ImageId): StoredGeneration | undefined
  /** Deletes models no generation uses any more. Returns how many. */
  pruneUnusedModels(): number
}

export interface MetadataRecordRepository {
  /** Replaces every raw record stored for the image, in one transaction. */
  replace(imageId: ImageId, records: readonly MetadataRecord[]): void
  /** The image's records in the order they were stored. */
  list(imageId: ImageId): MetadataRecord[]
}

/** When a directory's `log.html` was last read, to skip unchanged logs. */
export interface FileStamp {
  readonly sizeBytes: number
  readonly mtimeMs: number
}

export interface FooocusLogRepository {
  find(directoryId: DirectoryId): FileStamp | undefined
  save(directoryId: DirectoryId, stamp: FileStamp): void
}
