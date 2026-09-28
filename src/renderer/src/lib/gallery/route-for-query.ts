import type { GalleryQuery } from '@shared/gallery'
import { GalleryScopeKind } from '@shared/gallery-kinds'
import { ALL_PHOTOS, RouteKind, type Route } from '../routing/route'

/** The gallery route that shows `query`, used to go back from the detail view. */
export function routeForQuery(query: GalleryQuery | undefined): Route {
  if (!query) return ALL_PHOTOS
  const filters = query.filters ? { filters: query.filters } : {}
  if (query.scope.kind === GalleryScopeKind.All) return { kind: RouteKind.All, ...filters }
  return {
    kind: RouteKind.Directory,
    directoryId: query.scope.directoryId,
    recursive: query.scope.recursive,
    ...filters
  }
}
