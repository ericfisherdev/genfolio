import type { GenfolioApi } from '@shared/genfolio-api'
import { MAX_IDS_PER_MARK, SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery, ImageCard } from '@shared/gallery'
import { userMessage } from '../format/user-message'
import type { GalleryState } from './gallery.svelte'
import type { NoticeSink } from './notice-sink'

type Mark = Partial<Pick<ImageCard, 'favorite' | 'rating'>>

/** Whether the query's results or their order depend on favourites or ratings. */
function dependsOnMarks(query: GalleryQuery | undefined): boolean {
  return (
    query !== undefined &&
    (query.sort === SortOrder.Rating ||
      query.filters?.favoritesOnly === true ||
      query.filters?.minRating !== undefined)
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
    private readonly notices: NoticeSink
  ) {}

  setFavorite(ids: readonly number[], favorite: boolean): Promise<void> {
    return this.mark(
      ids,
      { favorite },
      (chunk) => this.api.setFavorite(chunk, favorite),
      'favourite'
    )
  }

  /** 0 clears the rating. */
  setRating(ids: readonly number[], rating: number): Promise<void> {
    return this.mark(ids, { rating }, (chunk) => this.api.setRating(chunk, rating), 'rate')
  }

  private async mark(
    ids: readonly number[],
    patch: Mark,
    send: (chunk: readonly number[]) => Promise<number>,
    verb: string
  ): Promise<void> {
    if (ids.length === 0) return
    const previous = this.gallery.patchCards(ids, patch)
    try {
      for (let start = 0; start < ids.length; start += MAX_IDS_PER_MARK) {
        await send(ids.slice(start, start + MAX_IDS_PER_MARK))
      }
    } catch (error) {
      this.gallery.restoreCards(previous)
      const what = ids.length === 1 ? 'the image' : `${ids.length} images`
      this.notices.notify(`Could not ${verb} ${what}: ${userMessage(error)}`)
      return
    }
    if (dependsOnMarks(this.gallery.query)) await this.gallery.refreshLayout()
  }
}
