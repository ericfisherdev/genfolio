import type { Album, AlbumChange } from './albums'
import type { DeleteMode, DeleteReport } from './deletion'
import type { AppDiagnostics } from './diagnostics'
import type { DirectoryNode, GalleryQuery, ImageCard } from './gallery'
import type { GenerationDetails } from './generation'
import type { ModelKind } from './generation-kinds'
import type { ModelFolders } from './model-folders'
import type {
  ModelChange,
  ModelDetail,
  ModelFields,
  ModelKey,
  ModelList,
  ModelListQuery
} from './models'
import type { SearchFacets, SearchFilters } from './search'
import type { Tag, TagChange } from './tags'
import type { CopyVariant } from './generation-kinds'
import type { AddRootViaDialogResult, RootSummary } from './library'
import type { ScanEvent } from './scan'
import type { ServiceHealth } from './service-health'
import type { SimilarGroupsPage } from './similarity'
import type { SlideshowPreset, SlideshowSettings } from './slideshow'
import type { UpdateEvent } from './updates'

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
  DeleteImages = 'image:delete',
  ListPresets = 'slideshow:list-presets',
  SavePreset = 'slideshow:save-preset',
  DeletePreset = 'slideshow:delete-preset',
  SimilarityThreshold = 'similarity:threshold',
  SetSimilarityThreshold = 'similarity:set-threshold',
  SimilarGroups = 'similarity:groups',
  SimilarGroupMembers = 'similarity:group-members',
  OpenLogs = 'app:open-logs',
  ReportRendererError = 'app:report-renderer-error',
  Diagnostics = 'app:diagnostics',
  DirectoryTree = 'gallery:directory-tree',
  RevealImage = 'image:reveal',
  CopyImagePath = 'image:copy-path',
  GetGeneration = 'image:get-generation',
  CopyGeneration = 'image:copy-generation',
  CancelUpdateDownload = 'app:cancel-update-download',
  GetModelFolders = 'settings:model-folders',
  ChooseModelFolder = 'settings:choose-model-folder',
  ClearModelFolder = 'settings:clear-model-folder',
  ListModels = 'models:list',
  GetModel = 'models:get',
  SaveModel = 'models:save',
  CreateModel = 'models:create',
  ClearModel = 'models:clear',
  CopyModelTriggerWords = 'models:copy-trigger-words'
}

/** Main → renderer push channels. */
export enum IpcEvent {
  Scan = 'library:scan-event',
  Update = 'app:update-event'
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
  /**
   * Deletes up to 10,000 images' files: to the trash, or permanently after main's own
   * confirmation (also offered when the trash fails). Deleted and already missing files'
   * images leave the library. Resolves what happened to each.
   */
  deleteImages(imageIds: readonly number[], mode: DeleteMode): Promise<DeleteReport>
  /** Named slideshow settings, by name. */
  listSlideshowPresets(): Promise<readonly SlideshowPreset[]>
  /** Saves under the name, replacing the settings of a preset with the same (folded) name. */
  saveSlideshowPreset(name: string, settings: SlideshowSettings): Promise<SlideshowPreset>
  /** Resolves false when the preset was already gone. */
  deleteSlideshowPreset(presetId: number): Promise<boolean>
  /** The Hamming distance (0–16) at or below which images are look-alikes. */
  getSimilarityThreshold(): Promise<number>
  /** Regroups every image at the new threshold before resolving. */
  setSimilarityThreshold(threshold: number): Promise<number>
  /** Up to 100 look-alike groups from `offset`, largest first, keeper first in each. */
  listSimilarGroups(offset: number, limit: number): Promise<SimilarGroupsPage>
  /** Every member of a look-alike group, the suggested keeper first. */
  listSimilarGroupMembers(groupId: number): Promise<readonly number[]>
  /** Opens the folder of log files in the file manager; false when it couldn't be opened. */
  openLogs(): Promise<boolean>
  /** Records an unexpected renderer error in main's log, by its name only. */
  reportRendererError(name: string): Promise<void>
  /** Service restarts and whether the service was given up on. */
  getDiagnostics(): Promise<AppDiagnostics>
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
  /** The folders downloaded models go to; each is null until chosen. */
  getModelFolders(): Promise<ModelFolders>
  /**
   * Shows the folder picker in main (the renderer never supplies a path) and stores the
   * choice for `kind`; resolves the folders, unchanged when the picker is cancelled.
   */
  chooseModelFolder(kind: ModelKind): Promise<ModelFolders>
  /** Forgets the folder for `kind`; files on disk are never touched. */
  clearModelFolder(kind: ModelKind): Promise<ModelFolders>
  /** A page of the checkpoints and LoRAs the library uses and those added by hand, by name. */
  listModels(query: ModelListQuery): Promise<ModelList>
  /** The model, or null when no image uses it and it has no entry. */
  getModel(key: ModelKey): Promise<ModelDetail | null>
  /** Records the fields; Missing when no image uses the model and it has no entry. */
  saveModel(key: ModelKey, fields: ModelFields): Promise<ModelChange>
  /** Adds a model by name (folders and extension are dropped); Duplicate when it has an entry. */
  createModel(kind: ModelKind, name: string, fields: ModelFields): Promise<ModelChange>
  /** Forgets what was recorded about the model; resolves false when there was nothing. */
  clearModel(key: ModelKey): Promise<boolean>
  /**
   * Puts the model's trigger words on the clipboard in main, comma-separated; false when it has
   * none.
   */
  copyModelTriggerWords(key: ModelKey): Promise<boolean>
  /** Subscribes to scan lifecycle events; returns the unsubscribe function. */
  onScanEvent(listener: (event: ScanEvent) => void): () => void
  /** Subscribes to the steps of an in-app update (Help → Check for Updates…). */
  onUpdateEvent(listener: (event: UpdateEvent) => void): () => void
  /** Stops the update download in progress, if any. */
  cancelUpdateDownload(): Promise<void>
}
