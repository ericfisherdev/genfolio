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

/** An image row as of one read: writes derived from that read apply only while it still holds. */
export interface ImageVersion {
  readonly id: ImageId
  readonly sizeBytes: number
  readonly mtimeMs: number
}

/** What a scan compares against: the stored size and mtime of each file. */
export interface StoredFileStat extends ImageVersion {
  readonly relDir: string
  readonly fileName: string
  /** The METADATA_INDEX_VERSION the row's metadata was indexed at (0 before Phase 2). */
  readonly metadataVersion: number
}

export interface ImageRepository {
  /**
   * Inserts or updates by (directory, file name) in one transaction; `addedAt` is kept on
   * update. Marks each row as indexed at METADATA_INDEX_VERSION, so callers index its
   * metadata in the same transaction. Returns each row's version, in input order.
   */
  upsertMany(images: readonly ImageFile[], addedAt: number): ImageVersion[]
  /** Every image in the directory by file name. */
  versionsInDirectory(directoryId: DirectoryId): Map<string, ImageVersion>
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
   * `null` removes the generation. Writes only while the image row still has `version`'s
   * size and mtime; returns false, writing nothing, when the image is gone or another writer
   * changed it since the metadata was read.
   */
  replace(version: ImageVersion, generation: StoredGeneration | null): boolean
  find(imageId: ImageId): StoredGeneration | undefined
  /** Deletes models no generation uses any more. Returns how many. */
  pruneUnusedModels(): number
}

export interface MetadataRecordRepository {
  /**
   * Replaces every raw record stored for the image, in one transaction, only while the image
   * row still has `version`'s size and mtime; returns false, writing nothing, otherwise.
   */
  replace(version: ImageVersion, records: readonly MetadataRecord[]): boolean
  /** The image's records in the order they were stored. */
  list(imageId: ImageId): MetadataRecord[]
}

/** When a directory's `log.html` was last read, to skip unchanged logs. */
export interface FileStamp {
  readonly sizeBytes: number
  /** Whole milliseconds; repositories truncate, so compare truncated values. */
  readonly mtimeMs: number
}

export interface FooocusLogRepository {
  find(directoryId: DirectoryId): FileStamp | undefined
  save(directoryId: DirectoryId, stamp: FileStamp): void
  remove(directoryId: DirectoryId): void
}
