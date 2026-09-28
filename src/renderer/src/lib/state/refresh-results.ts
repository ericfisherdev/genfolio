import { GalleryScopeKind } from '@shared/gallery-kinds'
import type { FacetsState } from './facets.svelte'
import type { GalleryState } from './gallery.svelte'
import { LayoutUpdate } from './image-marks'

type Results = Pick<GalleryState, 'query' | 'refreshLayout' | 'markLayoutStale'>
type Facets = Pick<FacetsState, 'load'>

/**
 * After tags change: tag counts are facets, and a view filtered by tags may gain or lose
 * images. With `LayoutUpdate.Deferred` (an image is open and being stepped through) the
 * layout is only flagged stale, for the grid to reload when shown again.
 */
export function refreshAfterTagChange(
  gallery: Results,
  facets: Facets,
  update: LayoutUpdate
): void {
  const query = gallery.query
  if (!query) return
  void facets.load(query)
  if (query.filters?.tags) reloadLayout(gallery, update)
}

/** After an album changes: an album view may have gained, lost or reordered images. */
export function refreshAfterAlbumChange(
  gallery: Results,
  facets: Facets,
  update: LayoutUpdate
): void {
  const query = gallery.query
  if (query?.scope.kind !== GalleryScopeKind.Album) return
  void facets.load(query)
  reloadLayout(gallery, update)
}

function reloadLayout(gallery: Results, update: LayoutUpdate): void {
  if (update === LayoutUpdate.Deferred) gallery.markLayoutStale()
  else void gallery.refreshLayout()
}
