import type { DirectoryNode, GalleryQuery, ImageCard } from '@shared/gallery'
import type { RootId } from './library'

/** Read-only queries behind the gallery; implemented over the library database. */
export interface GalleryReader {
  /**
   * `[id, width, height, version]*` for every image in scope, in the query's sort order,
   * ties by id. The version is a non-negative Int32 that changes whenever the file does.
   */
  layout(query: GalleryQuery): Int32Array<ArrayBuffer>
  /** Cards for the given ids; unknown ids are left out. Order is not guaranteed. */
  images(ids: readonly number[]): ImageCard[]
  /**
   * The root's folder tree with direct and total image counts. Folders with no images
   * anywhere below them are left out; the root folder is always present. `undefined` when
   * the root is unknown or has no directories yet.
   */
  directoryTree(rootId: RootId): DirectoryNode | undefined
}
