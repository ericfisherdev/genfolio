import type { GalleryQuery } from '@shared/gallery'
import { GalleryScopeKind } from '@shared/gallery-kinds'
import { ALL_PHOTOS, RouteKind, type Route } from '../routing/route'

/** The gallery route that shows `query`, used to go back from the detail view. */
export function routeForQuery(query: GalleryQuery | undefined): Route {
  if (!query) return ALL_PHOTOS
  const filters = query.filters ? { filters: query.filters } : {}
  switch (query.scope.kind) {
    case GalleryScopeKind.All:
      return { kind: RouteKind.All, ...filters }
    case GalleryScopeKind.Directory:
      return {
        kind: RouteKind.Directory,
        directoryId: query.scope.directoryId,
        recursive: query.scope.recursive,
        ...filters
      }
    case GalleryScopeKind.Album:
      return { kind: RouteKind.Album, albumId: query.scope.albumId, ...filters }
  }
}
