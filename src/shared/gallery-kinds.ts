// Runtime enums and constants with no zod dependency, safe for the renderer bundle.

export enum SortOrder {
  Newest = 'newest',
  Oldest = 'oldest',
  RecentlyAdded = 'recently-added',
  FileName = 'file-name'
}

export enum GalleryScopeKind {
  All = 'all',
  Directory = 'directory'
}

/** Values per image in a layout array: `[id, width, height]`. */
export const LAYOUT_STRIDE = 3

/** Most ids one `getImages` call accepts; the renderer asks for the visible range only. */
export const MAX_IMAGES_PER_REQUEST = 500
