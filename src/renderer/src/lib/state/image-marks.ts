import type { GenfolioApi } from '@shared/genfolio-api'
import { MAX_IDS_PER_MARK, SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery, ImageCard } from '@shared/gallery'
import { userMessage } from '../format/user-message'
import { RouteKind, type Route } from '../routing/route'
import type { FacetsState } from './facets.svelte'
import type { GalleryState } from './gallery.svelte'
import type { NoticeSink } from './notice-sink'

type Mark = Partial<Pick<ImageCard, 'favorite' | 'rating'>>

/** How a mark treats results that depend on marks (a favourites or rating view). */
export enum LayoutUpdate {
  /** Reload the layout and facet counts at once. */
  Now = 'now',
  /** The caller is stepping through the layout: reload when the grid is shown again. */
  Deferred = 'deferred'
}

/** Defer while an image is open: its page steps through the layout. */
export function layoutUpdateFor(route: Route): LayoutUpdate {
  return route.kind === RouteKind.Image ? LayoutUpdate.Deferred : LayoutUpdate.Now
}

/** Whether the query's results, their order or their facet counts depend on marks. */
function dependsOnMarks(query: GalleryQuery): boolean {
  return (
    query.sort === SortOrder.Rating ||
    query.filters?.favoritesOnly === true ||
    query.filters?.minRating !== undefined
  )
}

/**
 * Favourites and ratings, applied optimistically: cards change at once, and a failure puts
 * them back and says so in the notice bar. Never rejects.
 */
export class ImageMarks {
  constructor(
    private readonly api: Pick<GenfolioApi, 'setFavorite' | 'setRating'>,
    private readonly gallery: GalleryState,
    private readonly facets: Pick<FacetsState, 'load'>,
    private readonly notices: NoticeSink
  ) {}

  /** Resolves whether the change was stored (a failure is already reported). */
  setFavorite(
    ids: readonly number[],
    favorite: boolean,
    update = LayoutUpdate.Now
  ): Promise<boolean> {
    return this.mark(
      ids,
      { favorite },
      (chunk) => this.api.setFavorite(chunk, favorite),
      'favourite',
      update
    )
  }

  /** 0 clears the rating. Resolves whether the change was stored. */
  setRating(ids: readonly number[], rating: number, update = LayoutUpdate.Now): Promise<boolean> {
    return this.mark(ids, { rating }, (chunk) => this.api.setRating(chunk, rating), 'rate', update)
  }

  private async mark(
    ids: readonly number[],
    fields: Mark,
    send: (chunk: readonly number[]) => Promise<number>,
    verb: string,
    update: LayoutUpdate
  ): Promise<boolean> {
    if (ids.length === 0) return true
    const patch = this.gallery.patchCards(ids, fields)
    let start = 0
    try {
      for (; start < ids.length; start += MAX_IDS_PER_MARK) {
        await send(ids.slice(start, start + MAX_IDS_PER_MARK))
      }
    } catch (error) {
      // Earlier chunks were stored; only the failed chunk and the rest go back.
      patch.revert(ids.slice(start))
      const what = ids.length === 1 ? 'the image' : `${ids.length} images`
      this.notices.notify(`Could not ${verb} ${what}: ${userMessage(error)}`)
      if (start > 0) await this.refreshResults(update)
      return false
    }
    await this.refreshResults(update)
    return true
  }

  private async refreshResults(update: LayoutUpdate): Promise<void> {
    const query = this.gallery.query
    if (!query || !dependsOnMarks(query)) return
    if (update === LayoutUpdate.Deferred) this.gallery.markLayoutStale()
    else await Promise.all([this.gallery.refreshLayout(), this.facets.load(query)])
  }
}
