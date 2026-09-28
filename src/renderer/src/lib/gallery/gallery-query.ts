import { GalleryScopeKind, type SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery } from '@shared/gallery'
import { filtersKey } from '../routing/filter-params'
import { RouteKind, type GalleryRoute, type Route } from '../routing/route'

/** The gallery query a route shows; image routes keep showing `previous`. */
export function queryForRoute(
  route: Route,
  sort: SortOrder,
  previous: GalleryQuery | undefined
): GalleryQuery | undefined {
  switch (route.kind) {
    case RouteKind.All:
      return { scope: { kind: GalleryScopeKind.All }, sort, ...filtersOf(route) }
    case RouteKind.Directory:
      return {
        scope: {
          kind: GalleryScopeKind.Directory,
          directoryId: route.directoryId,
          recursive: route.recursive
        },
        sort,
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
  const { scope, sort } = query
  const where =
    scope.kind === GalleryScopeKind.All
      ? 'all'
      : `dir:${scope.directoryId}:${scope.recursive ? 1 : 0}`
  const filters = filtersKey(query.filters)
  return filters ? `${where}|${sort}|${filters}` : `${where}|${sort}`
}
