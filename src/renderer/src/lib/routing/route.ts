import type { SearchFilters } from '@shared/search'
import { filtersKey, parseFilters, writeFilters } from './filter-params'

export enum RouteKind {
  All = 'all',
  Directory = 'directory',
  Album = 'album',
  Image = 'image',
  Slideshow = 'slideshow',
  /** Every look-alike group, with the threshold. */
  SimilarGroups = 'similar-groups',
  /** One look-alike group, as a gallery. */
  SimilarGroup = 'similar-group'
}

export type Route =
  | { readonly kind: RouteKind.All; readonly filters?: SearchFilters }
  | {
      readonly kind: RouteKind.Directory
      readonly directoryId: number
      readonly recursive: boolean
      readonly filters?: SearchFilters
    }
  | { readonly kind: RouteKind.Album; readonly albumId: number; readonly filters?: SearchFilters }
  | {
      readonly kind: RouteKind.SimilarGroup
      readonly groupId: number
      readonly filters?: SearchFilters
    }
  | { readonly kind: RouteKind.SimilarGroups }
  | { readonly kind: RouteKind.Image; readonly imageId: number }
  /** Plays the current results, from `startId` or their first image. */
  | { readonly kind: RouteKind.Slideshow; readonly startId?: number }

/** Routes that show a gallery, which is where filters apply. */
export type GalleryRoute = Exclude<
  Route,
  { kind: RouteKind.Image | RouteKind.Slideshow | RouteKind.SimilarGroups }
>

/** Whether the route shows a gallery; the others show the current results image by image. */
export const isGalleryRoute = (route: Route): route is GalleryRoute =>
  route.kind !== RouteKind.Image &&
  route.kind !== RouteKind.Slideshow &&
  route.kind !== RouteKind.SimilarGroups

export const ALL_PHOTOS: Route = { kind: RouteKind.All }

const ALL = /^#\/?$/
const DIRECTORY = /^#\/dir\/([1-9]\d*)$/
const ALBUM = /^#\/album\/([1-9]\d*)$/
const IMAGE = /^#\/image\/([1-9]\d*)$/
const SLIDESHOW = /^#\/slideshow$/
const SIMILAR_GROUPS = /^#\/similar$/
const SIMILAR_GROUP = /^#\/similar\/([1-9]\d*)$/
const POSITIVE = /^[1-9]\d*$/

/** Parses a location hash; an unrecognised path is All Photos, invalid filters are dropped. */
export function parseRoute(hash: string): Route {
  const at = hash.indexOf('?')
  const path = at < 0 ? hash : hash.slice(0, at)
  const params = new URLSearchParams(at < 0 ? '' : hash.slice(at + 1))
  const image = IMAGE.exec(path)
  if (image) return { kind: RouteKind.Image, imageId: Number(image[1]) }
  if (SLIDESHOW.test(path)) {
    const start = params.get('start')
    return start !== null && POSITIVE.test(start)
      ? { kind: RouteKind.Slideshow, startId: Number(start) }
      : { kind: RouteKind.Slideshow }
  }
  const filters = parseFilters(params)
  const withFilters = filters ? { filters } : {}
  if (SIMILAR_GROUPS.test(path)) return { kind: RouteKind.SimilarGroups }
  const group = SIMILAR_GROUP.exec(path)
  if (group) return { kind: RouteKind.SimilarGroup, groupId: Number(group[1]), ...withFilters }
  const album = ALBUM.exec(path)
  if (album) return { kind: RouteKind.Album, albumId: Number(album[1]), ...withFilters }
  const directory = DIRECTORY.exec(path)
  const recursive = params.get('recursive')
  if (directory && (recursive === null || recursive === '0' || recursive === '1')) {
    return {
      kind: RouteKind.Directory,
      directoryId: Number(directory[1]),
      recursive: recursive !== '0',
      ...withFilters
    }
  }
  return ALL.test(path) ? { kind: RouteKind.All, ...withFilters } : ALL_PHOTOS
}

export function formatRoute(route: Route): string {
  if (route.kind === RouteKind.Image) return `#/image/${route.imageId}`
  if (route.kind === RouteKind.SimilarGroups) return '#/similar'
  if (route.kind === RouteKind.Slideshow) {
    return route.startId === undefined ? '#/slideshow' : `#/slideshow?start=${route.startId}`
  }
  const params = new URLSearchParams()
  if (route.kind === RouteKind.Directory) params.set('recursive', route.recursive ? '1' : '0')
  writeFilters(route.filters, params)
  const query = params.toString()
  const path = galleryPath(route)
  return query ? `${path}?${query}` : path
}

function galleryPath(route: GalleryRoute): string {
  switch (route.kind) {
    case RouteKind.All:
      return '#/'
    case RouteKind.Directory:
      return `#/dir/${route.directoryId}`
    case RouteKind.Album:
      return `#/album/${route.albumId}`
    case RouteKind.SimilarGroup:
      return `#/similar/${route.groupId}`
  }
}

/** The route's filters, if it is a gallery route that has any. */
export function routeFilters(route: Route): SearchFilters | undefined {
  return isGalleryRoute(route) ? route.filters : undefined
}

/** The same gallery route with other filters (none when `filters` is empty or undefined). */
export function withFilters(route: GalleryRoute, filters: SearchFilters | undefined): GalleryRoute {
  const scope = withoutFilters(route)
  return !filters || filtersKey(filters) === '' ? scope : { ...scope, filters }
}

function withoutFilters(route: GalleryRoute): GalleryRoute {
  switch (route.kind) {
    case RouteKind.All:
      return { kind: RouteKind.All }
    case RouteKind.Directory:
      return {
        kind: RouteKind.Directory,
        directoryId: route.directoryId,
        recursive: route.recursive
      }
    case RouteKind.Album:
      return { kind: RouteKind.Album, albumId: route.albumId }
    case RouteKind.SimilarGroup:
      return { kind: RouteKind.SimilarGroup, groupId: route.groupId }
  }
}
