// Runtime enums and constants with no zod dependency, safe for the renderer bundle.

export enum SortOrder {
  Newest = 'newest',
  Oldest = 'oldest',
  RecentlyAdded = 'recently-added',
  FileName = 'file-name',
  /** Highest rated first, then newest. */
  Rating = 'rating'
}

export enum GalleryScopeKind {
  All = 'all',
  Directory = 'directory'
}

/** Values per image in a layout array: `[id, width, height]`. */
export const LAYOUT_STRIDE = 3

/** Stars an image can have; 0 is unrated. */
export const MAX_RATING = 5

/** Most ids one bulk mark (favourite, rating) request accepts; larger selections are chunked. */
export const MAX_IDS_PER_MARK = 10_000

/** Most ids one `getImages` call accepts; the renderer asks for the visible range only. */
export const MAX_IMAGES_PER_REQUEST = 500
