import type { Album, AlbumChange } from './albums'
import type { DirectoryNode, GalleryQuery, ImageCard } from './gallery'
import type { GenerationDetails } from './generation'
import type { SearchFacets, SearchFilters } from './search'
import type { Tag, TagChange } from './tags'
import type { CopyVariant } from './generation-kinds'
import type { AddRootViaDialogResult, RootSummary } from './library'
import type { ScanEvent } from './scan'
import type { ServiceHealth } from './service-health'

/** Renderer → main request channels. One channel per API method. */
export enum IpcChannel {
  ServiceHealth = 'service:health',
  ListRoots = 'library:list-roots',
  AddRootViaDialog = 'library:add-root-via-dialog',
  RemoveRoot = 'library:remove-root',
  RescanRoot = 'library:rescan-root',
  GalleryLayout = 'gallery:layout',
  GalleryImages = 'gallery:images',
  SearchFacets = 'search:facets',
  SetFavorite = 'image:set-favorite',
  SetRating = 'image:set-rating',
  ListTags = 'tags:list',
  ImageTags = 'tags:of-image',
  CreateTag = 'tags:create',
  RenameTag = 'tags:rename',
  MergeTags = 'tags:merge',
  DeleteTag = 'tags:delete',
  ApplyTags = 'tags:apply',
  RemoveTags = 'tags:remove',
  ListAlbums = 'albums:list',
  CreateAlbum = 'albums:create',
  CreateSmartAlbum = 'albums:create-smart',
  RenameAlbum = 'albums:rename',
  DeleteAlbum = 'albums:delete',
  SetAlbumCover = 'albums:set-cover',
  AddToAlbum = 'albums:add',
  RemoveFromAlbum = 'albums:remove',
  MoveInAlbum = 'albums:move',
  DirectoryTree = 'gallery:directory-tree',
  RevealImage = 'image:reveal',
  CopyImagePath = 'image:copy-path',
  GetGeneration = 'image:get-generation',
  CopyGeneration = 'image:copy-generation'
}

/** Main → renderer push channels. */
export enum IpcEvent {
  Scan = 'library:scan-event'
}

/**
 * API exposed to the renderer as `window.genfolio` by the preload script. Every request
 * rejects when the service fails, does not answer within 30 s, or has exited and could
 * not be restarted.
 */
export interface GenfolioApi {
  getServiceHealth(): Promise<ServiceHealth>
  listRoots(): Promise<readonly RootSummary[]>
  /** Shows the folder picker in main; the renderer never supplies a path. */
  addRootViaDialog(): Promise<AddRootViaDialogResult>
  /** Removes the root's library rows; files on disk are never touched. */
  removeRoot(rootId: number): Promise<boolean>
  /** Resolves false when a scan of that root is already running. */
  rescanRoot(rootId: number): Promise<boolean>
  /** `[id, width, height]*` for every image in scope, in display order. */
  getImageLayout(query: GalleryQuery): Promise<Int32Array>
  /** Filter picker values with counts, over the query's scope and its other filters. */
  getFacets(query: GalleryQuery): Promise<SearchFacets>
  /** Marks up to 10,000 images (MAX_IDS_PER_MARK); resolves how many exist and were set. */
  setFavorite(ids: readonly number[], favorite: boolean): Promise<number>
  /** Rates up to 10,000 images 0 (unrated) to 5; resolves how many exist and were set. */
  setRating(ids: readonly number[], rating: number): Promise<number>
  /** Every tag with its image count, by name. */
  listTags(): Promise<readonly Tag[]>
  /** The image's tags, by name. */
  getImageTags(imageId: number): Promise<readonly Tag[]>
  /** Names are trimmed; a name folding to an existing tag's is a Duplicate outcome. */
  createTag(name: string): Promise<TagChange>
  renameTag(tagId: number, name: string): Promise<TagChange>
  /** Moves every image of `fromId` onto `intoId` and deletes `fromId`. */
  mergeTags(fromId: number, intoId: number): Promise<TagChange>
  /** Resolves false when the tag was already gone. */
  deleteTag(tagId: number): Promise<boolean>
  /** Tags up to 10,000 images; resolves how many links were added. */
  applyTags(tagIds: readonly number[], imageIds: readonly number[]): Promise<number>
  /** Resolves how many links were removed. */
  removeTags(tagIds: readonly number[], imageIds: readonly number[]): Promise<number>
  /** Every album with its size and cover, by name. */
  listAlbums(): Promise<readonly Album[]>
  /** Creates an empty manual album; a name folding to an existing album's is a Duplicate. */
  createAlbum(name: string): Promise<AlbumChange>
  /** Saves the filters as a smart album, which shows what matches them whenever it opens. */
  createSmartAlbum(name: string, filters: SearchFilters): Promise<AlbumChange>
  renameAlbum(albumId: number, name: string): Promise<AlbumChange>
  /** Resolves false when the album was already gone; the images stay in the library. */
  deleteAlbum(albumId: number): Promise<boolean>
  /** Only an image in the album can be its cover; null goes back to the first image. */
  setAlbumCover(albumId: number, imageId: number | null): Promise<AlbumChange>
  /** Appends up to 10,000 images to a manual album; resolves how many were new to it. */
  addToAlbum(albumId: number, imageIds: readonly number[]): Promise<number>
  /** Resolves how many entries were removed. */
  removeFromAlbum(albumId: number, imageIds: readonly number[]): Promise<number>
  /**
   * Moves the images, kept in their album order, to just before `beforeId` (null: the end).
   * Resolves how many moved.
   */
  moveInAlbum(
    albumId: number,
    imageIds: readonly number[],
    beforeId: number | null
  ): Promise<number>
  /** Cards for up to 500 ids (MAX_IMAGES_PER_REQUEST); unknown ids are left out. */
  getImages(ids: readonly number[]): Promise<readonly ImageCard[]>
  /** The root's folder tree with counts, or null when the root is unknown or empty. */
  getDirectoryTree(rootId: number): Promise<DirectoryNode | null>
  /** Shows the image in the system file manager; false when it cannot be found. */
  revealImage(imageId: number): Promise<boolean>
  /** Copies the image's full path to the clipboard; false when it cannot be found. */
  copyImagePath(imageId: number): Promise<boolean>
  /** How the image was generated, or null when it is unknown or carries no generation data. */
  getGeneration(imageId: number): Promise<GenerationDetails | null>
  /**
   * Puts the variant's text on the clipboard in main (the renderer never passes clipboard
   * text); false when the image has no such text.
   */
  copyGeneration(imageId: number, variant: CopyVariant): Promise<boolean>
  /** Subscribes to scan lifecycle events; returns the unsubscribe function. */
  onScanEvent(listener: (event: ScanEvent) => void): () => void
}
