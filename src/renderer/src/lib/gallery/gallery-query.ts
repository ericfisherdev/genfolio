import { GalleryScopeKind, type SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery } from '@shared/gallery'
import { filtersKey } from '../routing/filter-params'
import { RouteKind, type GalleryRoute, type Route } from '../routing/route'

/**
 * The sort orders a view uses: manual albums keep their own, which defaults to album order;
 * the library, its folders and smart albums (saved searches) share `current`.
 */
export interface ViewSorts {
  readonly current: SortOrder
  readonly album: SortOrder
}

/** The gallery query a route shows; image routes keep showing `previous`. */
export function queryForRoute(
  route: Route,
  sorts: ViewSorts,
  previous: GalleryQuery | undefined,
  isSmartAlbum: (albumId: number) => boolean
): GalleryQuery | undefined {
  switch (route.kind) {
    case RouteKind.All:
      return { scope: { kind: GalleryScopeKind.All }, sort: sorts.current, ...filtersOf(route) }
    case RouteKind.Directory:
      return {
        scope: {
          kind: GalleryScopeKind.Directory,
          directoryId: route.directoryId,
          recursive: route.recursive
        },
        sort: sorts.current,
        ...filtersOf(route)
      }
    case RouteKind.Album:
      return {
        scope: { kind: GalleryScopeKind.Album, albumId: route.albumId },
        sort: isSmartAlbum(route.albumId) ? sorts.current : sorts.album,
        ...filtersOf(route)
      }
    case RouteKind.Image:
      return previous
  }
}

const filtersOf = (route: GalleryRoute): Pick<GalleryQuery, 'filters'> =>
  route.filters ? { filters: route.filters } : {}

/** Stable identity of a query, for change detection and remembered scroll positions. */
export function queryKey(query: GalleryQuery): string {
  const where = scopeKey(query.scope)
  const filters = filtersKey(query.filters)
  return filters ? `${where}|${query.sort}|${filters}` : `${where}|${query.sort}`
}

function scopeKey(scope: GalleryQuery['scope']): string {
  switch (scope.kind) {
    case GalleryScopeKind.All:
      return 'all'
    case GalleryScopeKind.Directory:
      return `dir:${scope.directoryId}:${scope.recursive ? 1 : 0}`
    case GalleryScopeKind.Album:
      return `album:${scope.albumId}`
  }
}
