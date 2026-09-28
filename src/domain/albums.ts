import type { SearchFilters, StoredSearchFilters } from '@shared/search'
import type { ImageId } from './library'

/**
 * Converts search filters to the form a smart album keeps (models, tags and the prompt by
 * name, since row ids are recycled) and back when it is opened.
 */
export interface StoredFilterCodec {
  /** Ids that no longer exist are left out; a list left empty drops its filter. */
  store(filters: SearchFilters): StoredSearchFilters
  /**
   * The filters with names resolved to ids, or `undefined` when a name that must match is
   * gone, so the album matches nothing (an excluded name that is gone is simply dropped).
   */
  resolve(stored: StoredSearchFilters): SearchFilters | undefined
}

/** What a smart album holds right now, since its members are evaluated rather than stored. */
export interface SmartAlbumContents {
  readonly imageCount: number
  /** Newest first, as a smart album shows by default. */
  readonly firstImageId: ImageId | null
}

export interface SmartAlbumEvaluator {
  contents(albumId: number): SmartAlbumContents
}
