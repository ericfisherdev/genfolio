export enum RouteKind {
  All = 'all',
  Directory = 'directory',
  Image = 'image'
}

export type Route =
  | { readonly kind: RouteKind.All }
  | {
      readonly kind: RouteKind.Directory
      readonly directoryId: number
      readonly recursive: boolean
    }
  | { readonly kind: RouteKind.Image; readonly imageId: number }

export const ALL_PHOTOS: Route = { kind: RouteKind.All }

const DIRECTORY = /^#\/dir\/([1-9]\d*)(?:\?recursive=([01]))?$/
const IMAGE = /^#\/image\/([1-9]\d*)$/

/** Parses a location hash; anything unrecognised is All Photos. */
export function parseRoute(hash: string): Route {
  const directory = DIRECTORY.exec(hash)
  if (directory) {
    return {
      kind: RouteKind.Directory,
      directoryId: Number(directory[1]),
      recursive: directory[2] !== '0'
    }
  }
  const image = IMAGE.exec(hash)
  if (image) return { kind: RouteKind.Image, imageId: Number(image[1]) }
  return ALL_PHOTOS
}

export function formatRoute(route: Route): string {
  switch (route.kind) {
    case RouteKind.All:
      return '#/'
    case RouteKind.Directory:
      return `#/dir/${route.directoryId}?recursive=${route.recursive ? 1 : 0}`
    case RouteKind.Image:
      return `#/image/${route.imageId}`
  }
}
