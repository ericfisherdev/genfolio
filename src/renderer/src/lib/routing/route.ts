import { modelKeySchema, type ModelKey } from '@shared/models'
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
  SimilarGroup = 'similar-group',
  /** Application settings, such as the model download folders. */
  Settings = 'settings',
  /** The checkpoints and LoRAs, with what is known about each. */
  Models = 'models',
  /** How the checkpoints and LoRAs are used, overall or for one model. */
  Stats = 'stats',
  /** Finding and downloading models from Civitai. */
  Civitai = 'civitai'
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
  | { readonly kind: RouteKind.Settings }
  /** The models page, with `model` open when a link names one. */
  | { readonly kind: RouteKind.Models; readonly model?: ModelKey }
  /** The stats overview, narrowed to a model tag, or the drill-down of `model`. */
  | { readonly kind: RouteKind.Stats; readonly modelTagId?: number; readonly model?: ModelKey }
  | { readonly kind: RouteKind.Civitai }
  | { readonly kind: RouteKind.Image; readonly imageId: number }
  /** Plays the current results, from `startId` or their first image. */
  | { readonly kind: RouteKind.Slideshow; readonly startId?: number }

/** Routes that show a gallery, which is where filters apply. */
export type GalleryRoute = Exclude<
  Route,
  {
    kind:
      | RouteKind.Image
      | RouteKind.Slideshow
      | RouteKind.SimilarGroups
      | RouteKind.Settings
      | RouteKind.Models
      | RouteKind.Stats
      | RouteKind.Civitai
  }
>

/** Whether the route shows a gallery; the others show the current results image by image. */
export const isGalleryRoute = (route: Route): route is GalleryRoute =>
  route.kind !== RouteKind.Image &&
  route.kind !== RouteKind.Slideshow &&
  route.kind !== RouteKind.SimilarGroups &&
  route.kind !== RouteKind.Settings &&
  route.kind !== RouteKind.Models &&
  route.kind !== RouteKind.Stats &&
  route.kind !== RouteKind.Civitai

export const ALL_PHOTOS: Route = { kind: RouteKind.All }

const ALL = /^#\/?$/
const DIRECTORY = /^#\/dir\/([1-9]\d*)$/
const ALBUM = /^#\/album\/([1-9]\d*)$/
const IMAGE = /^#\/image\/([1-9]\d*)$/
const SLIDESHOW = /^#\/slideshow$/
const SETTINGS = /^#\/settings$/
const MODELS = /^#\/models$/
const STATS = /^#\/stats(?:\/([a-z]+)\/([^/]+))?$/
const CIVITAI = /^#\/civitai$/
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
  if (SETTINGS.test(path)) return { kind: RouteKind.Settings }
  if (MODELS.test(path)) return modelsRoute(params)
  const stats = STATS.exec(path)
  if (stats) return statsRoute(stats[1], stats[2], params)
  if (CIVITAI.test(path)) return { kind: RouteKind.Civitai }
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

/** The Models page opening the model the parameters name; none, or a malformed one, is the plain page. */
function modelsRoute(params: URLSearchParams): Route {
  const model = modelKeySchema.safeParse({
    kind: params.get('kind'),
    identity: params.get('identity')
  })
  return model.success ? { kind: RouteKind.Models, model: model.data } : { kind: RouteKind.Models }
}

/**
 * The stats page for a path with an optional `kind/identity` drill-down, and its `mtag`
 * parameter. A malformed model or tag is dropped, leaving the overview.
 */
function statsRoute(
  kind: string | undefined,
  encodedIdentity: string | undefined,
  params: URLSearchParams
): Route {
  const mtag = params.get('mtag')
  const model = statsModel(kind, encodedIdentity)
  return {
    kind: RouteKind.Stats,
    ...(mtag !== null && POSITIVE.test(mtag) ? { modelTagId: Number(mtag) } : {}),
    ...(model ? { model } : {})
  }
}

function statsModel(
  kind: string | undefined,
  encodedIdentity: string | undefined
): ModelKey | undefined {
  if (kind === undefined || encodedIdentity === undefined) return undefined
  try {
    const model = modelKeySchema.safeParse({ kind, identity: decodeURIComponent(encodedIdentity) })
    return model.success ? model.data : undefined
  } catch {
    return undefined // a malformed %-escape
  }
}

function formatStatsRoute(modelTagId: number | undefined, model: ModelKey | undefined): string {
  const path = model ? `#/stats/${model.kind}/${encodeURIComponent(model.identity)}` : '#/stats'
  return modelTagId === undefined ? path : `${path}?mtag=${modelTagId}`
}

function formatModelsRoute(model: ModelKey | undefined): string {
  if (!model) return '#/models'
  return `#/models?${new URLSearchParams({ kind: model.kind, identity: model.identity })}`
}

export function formatRoute(route: Route): string {
  if (route.kind === RouteKind.Image) return `#/image/${route.imageId}`
  if (route.kind === RouteKind.SimilarGroups) return '#/similar'
  if (route.kind === RouteKind.Settings) return '#/settings'
  if (route.kind === RouteKind.Models) return formatModelsRoute(route.model)
  if (route.kind === RouteKind.Stats) return formatStatsRoute(route.modelTagId, route.model)
  if (route.kind === RouteKind.Civitai) return '#/civitai'
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
