import type { GalleryQuery } from '@shared/gallery'
import { routeForQuery } from '../gallery/route-for-query'
import { RouteKind, type Route } from '../routing/route'
import type { RouterState } from '../routing/router.svelte'

/** Enters the slideshow and returns to the view it was started from. */
export class SlideshowNavigator {
  private origin: Route | undefined

  constructor(
    private readonly router: Pick<RouterState, 'route' | 'navigate'>,
    private readonly results: { readonly query: GalleryQuery | undefined }
  ) {}

  /** Plays the current results from `startId` (their first image when absent). */
  start(startId?: number): void {
    this.origin = this.router.route
    this.router.navigate(
      startId === undefined ? { kind: RouteKind.Slideshow } : { kind: RouteKind.Slideshow, startId }
    )
  }

  /** Back to where the slideshow started; the results' own view after a reload. */
  exit(): void {
    const origin = this.origin ?? routeForQuery(this.results.query)
    this.origin = undefined
    this.router.navigate(origin)
  }
}
