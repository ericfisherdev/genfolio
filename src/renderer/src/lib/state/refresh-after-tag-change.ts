import type { FacetsState } from './facets.svelte'
import type { GalleryState } from './gallery.svelte'
import { LayoutUpdate } from './image-marks'

/**
 * After tags change: tag counts are facets, and a view filtered by tags may gain or lose
 * images. With `LayoutUpdate.Deferred` (an image is open and being stepped through) the
 * layout is only flagged stale, for the grid to reload when shown again.
 */
export function refreshAfterTagChange(
  gallery: Pick<GalleryState, 'query' | 'refreshLayout' | 'markLayoutStale'>,
  facets: Pick<FacetsState, 'load'>,
  update: LayoutUpdate
): void {
  const query = gallery.query
  if (!query) return
  void facets.load(query)
  if (!query.filters?.tags) return
  if (update === LayoutUpdate.Deferred) gallery.markLayoutStale()
  else void gallery.refreshLayout()
}
