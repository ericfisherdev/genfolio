import { describe, expect, it } from 'vitest'
import { memoryStore } from '../testing/app-services'
import { DEFAULT_SLIDESHOW, SlideshowSettingsState } from './slideshow-settings.svelte'
import { SlideshowNavigator } from './slideshow-navigator'
import { RouteKind, type Route } from '../routing/route'
import type { GalleryQuery } from '@shared/gallery'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'

describe('SlideshowSettingsState', () => {
  it('keeps changes as the default for next time and ignores saved values out of range', () => {
    const values: Record<string, string> = {}
    const settings = new SlideshowSettingsState(memoryStore(values))
    expect(settings.current).toEqual(DEFAULT_SLIDESHOW)
    settings.update({ intervalMs: 10_000, shuffle: true })
    expect(new SlideshowSettingsState(memoryStore(values)).current).toEqual({
      ...DEFAULT_SLIDESHOW,
      intervalMs: 10_000,
      shuffle: true
    })
    const broken = { 'genfolio.slideshow': JSON.stringify({ ...DEFAULT_SLIDESHOW, intervalMs: 1 }) }
    expect(new SlideshowSettingsState(memoryStore(broken)).current).toEqual(DEFAULT_SLIDESHOW)
    expect(
      new SlideshowSettingsState(memoryStore({ 'genfolio.slideshow': '{nope' })).current
    ).toEqual(DEFAULT_SLIDESHOW)
  })
})

describe('SlideshowNavigator', () => {
  it('returns to the view it started from, or to the results after a reload', () => {
    let route: Route = { kind: RouteKind.Image, imageId: 4 }
    const router = {
      get route() {
        return route
      },
      navigate: (next: Route) => (route = next)
    }
    const query: GalleryQuery = {
      scope: { kind: GalleryScopeKind.Album, albumId: 2 },
      sort: SortOrder.Newest
    }
    const results = { query }
    const navigator = new SlideshowNavigator(router, results)
    navigator.start(4)
    expect(route).toEqual({ kind: RouteKind.Slideshow, startId: 4 })
    navigator.exit()
    expect(route).toEqual({ kind: RouteKind.Image, imageId: 4 })
    route = { kind: RouteKind.Slideshow }
    navigator.exit()
    expect(route).toEqual({ kind: RouteKind.Album, albumId: 2 })
  })
})
