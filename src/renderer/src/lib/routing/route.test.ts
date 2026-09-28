import { describe, expect, it } from 'vitest'
import { ALL_PHOTOS, formatRoute, parseRoute, RouteKind, type Route } from './route'

describe('routes', () => {
  it.each<Route>([
    ALL_PHOTOS,
    { kind: RouteKind.Directory, directoryId: 7, recursive: true },
    { kind: RouteKind.Directory, directoryId: 7, recursive: false },
    { kind: RouteKind.Image, imageId: 42 }
  ])('round-trips %j', (route) => {
    expect(parseRoute(formatRoute(route))).toEqual(route)
  })

  it('defaults a directory route without the flag to recursive', () => {
    expect(parseRoute('#/dir/3')).toEqual({
      kind: RouteKind.Directory,
      directoryId: 3,
      recursive: true
    })
  })

  it.each(['', '#', '#/dir/0', '#/dir/abc', '#/image/-1', '#/dir/3?recursive=2', '#/nowhere'])(
    'falls back to All Photos for %s',
    (hash) => {
      expect(parseRoute(hash)).toEqual(ALL_PHOTOS)
    }
  )
})
