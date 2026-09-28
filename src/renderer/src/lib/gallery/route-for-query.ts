import type { GalleryQuery } from '@shared/gallery'
import { GalleryScopeKind } from '@shared/gallery-kinds'
import { ALL_PHOTOS, RouteKind, type Route } from '../routing/route'

/** The gallery route that shows `query`, used to go back from the detail view. */
export function routeForQuery(query: GalleryQuery | undefined): Route {
  if (!query || query.scope.kind === GalleryScopeKind.All) return ALL_PHOTOS
  return {
    kind: RouteKind.Directory,
    directoryId: query.scope.directoryId,
    recursive: query.scope.recursive
  }
}
