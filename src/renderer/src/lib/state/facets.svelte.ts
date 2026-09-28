import type { GenfolioApi } from '@shared/genfolio-api'
import type { GalleryQuery } from '@shared/gallery'
import type { SearchFacets } from '@shared/search'
import { userMessage } from '../format/user-message'

/**
 * Picker values with counts for the gallery's current query. Keeps the last facets on screen
 * while newer ones load; stale responses are ignored. Never rejects: failures become
 * `loadError`.
 */
export class FacetsState {
  facets: SearchFacets | undefined = $state.raw(undefined)
  loadError: string | undefined = $state(undefined)
  private generation = 0

  constructor(private readonly api: Pick<GenfolioApi, 'getFacets'>) {}

  async load(query: GalleryQuery): Promise<void> {
    const generation = ++this.generation
    try {
      const facets = await this.api.getFacets(query)
      if (generation !== this.generation) return
      this.facets = facets
      this.loadError = undefined
    } catch (error) {
      if (generation === this.generation) this.loadError = userMessage(error)
    }
  }
}
