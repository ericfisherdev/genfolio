import type { ModelKind } from '@shared/generation-kinds'
import type { AlbumKind } from '@shared/album-kinds'
import type { MetadataOrigin } from '@shared/metadata-kinds'
import type { CivitaiRecord } from '@shared/model-civitai'
import type { ModelDetail, ModelFields, ModelKey, ModelList, ModelListQuery } from '@shared/models'
import type { StoredSearchFilters } from '@shared/search'
import type { SlideshowPreset, SlideshowSettings } from '@shared/slideshow'
import type { StoredGeneration } from './generation'
import type { ImageHashes } from './image-hashes'
import type { SimilarPair } from './similarity'
import type { SimilarGroup } from '@shared/similarity'
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
  /** The root's directories at these paths (`''` is the root itself), by path; unknown paths are skipped. */
  listByRelPaths(rootId: RootId, relPaths: readonly string[]): Directory[]
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
  /** The stats of the files directly in these directories of the root (`''` is the root itself). */
  fileStatsByDirectories(rootId: RootId, relDirs: readonly string[]): StoredFileStat[]
  /**
   * Deletes, in one transaction, each row that still has the size and mtime in `stats`;
   * rows another writer changed since the snapshot survive.
   */
  deleteMany(stats: readonly StoredFileStat[]): void
  /** Deletes the rows (their user data and generations cascade); returns how many. */
  deleteByIds(ids: readonly ImageId[]): number
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
  /**
   * The value of each image's record with this origin and key in the directory, by file name;
   * images without such a record are left out.
   */
  valuesInDirectory(
    directoryId: DirectoryId,
    origin: MetadataOrigin,
    key: string
  ): Map<string, string>
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

/** Finds stored checkpoints and LoRAs by name, so views can link to them as filters. */
export interface ModelDirectory {
  /**
   * The id of the stored model with this display name (as `find` returns it, already without
   * folders and extension; case ignored). Not re-derived from a raw name: stripping an
   * extension again would turn `foo.pt` into `foo`.
   */
  idOfDisplayName(kind: ModelKind, displayName: string): number | undefined
}

/** The user's marks on images: favourite and a 0–5 rating. Never touched by indexing. */
export interface ImageMarkRepository {
  /** Returns how many of the images exist (and so were set). */
  setFavorite(ids: readonly ImageId[], favorite: boolean): number
  /** `rating` is 0 (unrated) to 5. Returns how many of the images exist. */
  setRating(ids: readonly ImageId[], rating: number): number
}

/** A user tag with how many images carry it. */
export interface TagRecord {
  readonly id: number
  readonly name: string
  readonly imageCount: number
}

/**
 * User-owned tags, never written by indexing. Names are unique on nameKey() (case- and
 * accent-folded); `name` must already be trimmed and valid.
 */
export interface TagRepository {
  /** Every tag with its image count, by name. */
  list(): TagRecord[]
  /** The image's tags, by name. */
  tagsOf(imageId: ImageId): TagRecord[]
  /** The tag whose key equals `name`'s, if any. */
  findByName(name: string): TagRecord | undefined
  /** Throws DuplicateTagError when a tag with the same key exists. */
  create(name: string, createdAt: number): TagRecord
  /**
   * Throws UnknownTagError when the tag is gone, DuplicateTagError when another tag has the
   * new name's key (renaming to a different case or spelling of the same key is allowed).
   */
  rename(id: number, name: string): TagRecord
  /** Moves every link of `from` onto `into` and deletes `from`; throws UnknownTagError. */
  merge(from: number, into: number): TagRecord
  /** Returns false when the tag was already gone; links cascade. */
  delete(id: number): boolean
  /** Links each tag to each image; returns how many links were added. */
  apply(tagIds: readonly number[], imageIds: readonly ImageId[]): number
  /** Returns how many links were removed. */
  remove(tagIds: readonly number[], imageIds: readonly ImageId[]): number
}

export class DuplicateTagError extends Error {
  constructor(readonly existing: TagRecord) {
    super(`A tag named "${existing.name}" already exists`)
    this.name = 'DuplicateTagError'
  }
}

export class UnknownTagError extends Error {
  constructor(readonly tagId: number) {
    super(`Tag ${tagId} does not exist`)
    this.name = 'UnknownTagError'
  }
}

/** An album with its size and cover. */
export interface AlbumRecord {
  readonly id: number
  readonly name: string
  readonly kind: AlbumKind
  readonly imageCount: number
  /**
   * Manual: the chosen cover while it is in the album, else the first image in album order;
   * null when empty. Smart: the chosen cover, if any (members are evaluated elsewhere).
   */
  readonly coverImageId: ImageId | null
}

/**
 * User-owned albums, never written by indexing. Names are unique on nameKey(), as for tags.
 * Manual albums keep their images in a fractional `position` order; commands that change
 * membership or order apply only to manual albums and do nothing to smart ones.
 */
export interface AlbumRepository {
  /** Every album, by name. */
  list(): AlbumRecord[]
  /** Throws UnknownAlbumError. */
  find(id: number): AlbumRecord
  /** Creates an empty manual album; throws DuplicateAlbumError. */
  create(name: string, createdAt: number): AlbumRecord
  /** Creates a smart album that saves `filters`; throws DuplicateAlbumError. */
  createSmart(name: string, filters: StoredSearchFilters, createdAt: number): AlbumRecord
  /** Throws UnknownAlbumError, DuplicateAlbumError (another album has the new name's key). */
  rename(id: number, name: string): AlbumRecord
  /** Returns false when the album was already gone; its entries cascade. */
  delete(id: number): boolean
  /** Appends the images not already in the album, in the given order; returns how many. */
  add(albumId: number, imageIds: readonly ImageId[]): number
  /** Returns how many entries were removed. */
  remove(albumId: number, imageIds: readonly ImageId[]): number
  /**
   * Moves the album's images among `imageIds` (in their current album order) to just before
   * `beforeId`, or to the end when it is null or not in the album. Returns how many moved.
   */
  move(albumId: number, imageIds: readonly ImageId[], beforeId: ImageId | null): number
  /**
   * `null` goes back to the first image. A manual album's cover must be one of its images;
   * a smart album takes any image. Throws UnknownAlbumError.
   */
  setCover(albumId: number, imageId: ImageId | null): AlbumRecord
}

export class DuplicateAlbumError extends Error {
  constructor(readonly existing: AlbumRecord) {
    super(`An album named "${existing.name}" already exists`)
    this.name = 'DuplicateAlbumError'
  }
}

export class UnknownAlbumError extends Error {
  constructor(readonly albumId: number) {
    super(`Album ${albumId} does not exist`)
    this.name = 'UnknownAlbumError'
  }
}

/** Named slideshow settings. Names are unique on nameKey(); saving a taken name updates it. */
export interface SlideshowPresetRepository {
  /** Every preset, by name. */
  list(): SlideshowPreset[]
  /** Creates the preset, or replaces the settings of the one with the same name key. */
  save(name: string, settings: SlideshowSettings): SlideshowPreset
  /** Returns false when the preset was already gone. */
  delete(id: number): boolean
}

/** Content and perceptual hashes of images, written by the hashing pass. */
export interface ImageHashRepository {
  /** How many images still need hashing at `hashVersion`. */
  pendingCount(hashVersion: number): number
  /** Up to `limit` images needing hashing at `hashVersion`, by id, after `afterId`. */
  pending(hashVersion: number, afterId: number, limit: number): ImageVersion[]
  /**
   * Stores the hashes (null: the file could not be hashed, so it isn't retried) and marks
   * the image hashed at `hashVersion`, only while the row still has `version`'s size and
   * mtime. Returns false, writing nothing, otherwise.
   */
  store(version: ImageVersion, hashes: ImageHashes | null, hashVersion: number): boolean
}

/** An image's stored hashes, for comparing it with the others. */
export interface StoredHashes {
  readonly id: ImageId
  readonly sha256: Uint8Array | null
  readonly dhash: bigint
  readonly phash: bigint
}

/** What the user records about checkpoints and LoRAs, listed with the models images use. */
export interface ModelInfoRepository {
  /** Models the library's images use and those added by hand, by name. */
  list(query: ModelListQuery): ModelList
  find(key: ModelKey): ModelDetail | undefined
  /** Stores the fields; false when no model or entry has this key. */
  save(key: ModelKey, fields: ModelFields, now: number): boolean
  /** Records a model that has no entry yet; false when it already has one. */
  create(key: ModelKey, name: string, fields: ModelFields, now: number): boolean
  /**
   * Forgets the entry (a library model stays listed, with its Civitai link); a model added by
   * hand leaves the list, and its link with it. False when there was no entry.
   */
  clear(key: ModelKey): boolean
}

/** The Civitai version a model is linked to, and what it said when it was fetched. */
export interface ModelCivitaiRepository {
  /** Links the model, replacing any earlier link and what it fetched. */
  save(key: ModelKey, record: CivitaiRecord, now: number): void
  /**
   * Replaces what was fetched, only while the model is still linked to `versionId`; false when
   * it was unlinked or linked elsewhere meanwhile, in which case nothing is written.
   */
  update(key: ModelKey, versionId: number, record: CivitaiRecord, now: number): boolean
  /** The linked Civitai model and version, or undefined. */
  linkOf(key: ModelKey): { modelId: number; versionId: number } | undefined
  /** Forgets the link; false when there was none. */
  remove(key: ModelKey): boolean
}

/** Every file hash seen for a model, in the forms the tools that made the images wrote them. */
export interface ModelHashLookup {
  hashesOf(key: ModelKey): string[]
}

/** Named application settings, stored as text. */
export interface AppSettingsRepository {
  /** The stored value, or undefined. */
  get(key: string): string | undefined
  set(key: string, value: string): void
  remove(key: string): void
}

/** Similar pairs, groups and the grouping threshold. */
export interface SimilarityRepository {
  /** Every image with perceptual hashes. */
  hashed(): StoredHashes[]
  /** Those of `ids` that have perceptual hashes. */
  hashesOf(ids: readonly ImageId[]): StoredHashes[]
  /**
   * Replaces every pair involving `ids` with `pairs`, in one transaction. Returns whether any
   * pair was removed or stored, that is, whether the groups may be out of date.
   */
  replacePairs(ids: readonly ImageId[], pairs: readonly SimilarPair[]): boolean
  pairsWithin(distance: number): SimilarPair[]
  /**
   * Sets each image's group (image id → group id); every other image gets none. Only rows
   * whose group differs are written.
   */
  writeGroups(groups: ReadonlyMap<number, number>): void
  /** Groups largest first, each with its first `preview` members in keeper order. */
  groups(offset: number, limit: number, preview: number): SimilarGroup[]
  groupCount(): number
  /** Every member of a group, the suggested keeper first. */
  members(groupId: number): ImageId[]
  /** A stored setting, or undefined. */
  setting(key: string): string | undefined
  saveSetting(key: string, value: string): void
}
