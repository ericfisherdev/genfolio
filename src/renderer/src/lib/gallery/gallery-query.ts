import { GalleryScopeKind, type SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery } from '@shared/gallery'
import { RouteKind, type Route } from '../routing/route'

/** The gallery query a route shows; image routes keep showing `previous`. */
export function queryForRoute(
  route: Route,
  sort: SortOrder,
  previous: GalleryQuery | undefined
): GalleryQuery | undefined {
  switch (route.kind) {
    case RouteKind.All:
      return { scope: { kind: GalleryScopeKind.All }, sort }
    case RouteKind.Directory:
      return {
        scope: {
          kind: GalleryScopeKind.Directory,
          directoryId: route.directoryId,
          recursive: route.recursive
        },
        sort
      }
    case RouteKind.Image:
      return previous
  }
}

/** Stable identity of a query, for change detection and remembered scroll positions. */
export function queryKey(query: GalleryQuery): string {
  const { scope, sort } = query
  return scope.kind === GalleryScopeKind.All
    ? `all|${sort}`
    : `dir:${scope.directoryId}:${scope.recursive ? 1 : 0}|${sort}`
}
