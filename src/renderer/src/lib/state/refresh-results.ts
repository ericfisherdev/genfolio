import { GalleryScopeKind } from '@shared/gallery-kinds'
import type { FacetsState } from './facets.svelte'
import type { GalleryState } from './gallery.svelte'
import { LayoutUpdate } from './image-marks'

type Results = Pick<GalleryState, 'query' | 'refreshLayout' | 'markLayoutStale'>
type Facets = Pick<FacetsState, 'load'>

/**
 * After tags change: tag counts are facets, and a view filtered by tags (or an album, which
 * may be a smart one searching by tags) may gain or lose images, as may a view of untagged images. With `LayoutUpdate.Deferred`
 * (an image is open and being stepped through) the layout is only flagged stale, for the
 * grid to reload when shown again.
 */
export function refreshAfterTagChange(
  gallery: Results,
  facets: Facets,
  update: LayoutUpdate
): void {
  const query = gallery.query
  if (!query) return
  void facets.load(query)
  if (
    query.filters?.tags ||
    query.filters?.untagged ||
    query.scope.kind === GalleryScopeKind.Album
  ) {
    reloadLayout(gallery, update)
  }
}

/**
 * After an album changes: an album view may have gained, lost or reordered images, and a
 * "not in an album" view may have lost or regained some.
 */
export function refreshAfterAlbumChange(
  gallery: Results,
  facets: Facets,
  update: LayoutUpdate
): void {
  const query = gallery.query
  if (!query) return
  if (query.scope.kind !== GalleryScopeKind.Album && !query.filters?.unalbumed) return
  void facets.load(query)
  reloadLayout(gallery, update)
}

function reloadLayout(gallery: Results, update: LayoutUpdate): void {
  if (update === LayoutUpdate.Deferred) gallery.markLayoutStale()
  else void gallery.refreshLayout()
}
