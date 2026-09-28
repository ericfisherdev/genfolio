import { SvelteMap } from 'svelte/reactivity'
import type { GenfolioApi } from '@shared/genfolio-api'
import { LAYOUT_STRIDE, MAX_IMAGES_PER_REQUEST } from '@shared/gallery-kinds'
import type { GalleryQuery, ImageCard } from '@shared/gallery'
import { queryKey } from '../gallery/gallery-query'
import { userMessage } from '../format/user-message'

/**
 * The current result set: its layout (ids and sizes, loaded whole) and the cards fetched so
 * far for the images that have been visible. Stale responses from older queries are ignored.
 * No method rejects: a failed layout becomes `loadError`; failed card fetches are retried on
 * the next request.
 */
export class GalleryState {
  layout: Int32Array = $state.raw(new Int32Array(0))
  query: GalleryQuery | undefined = $state.raw(undefined)
  loading = $state(false)
  /** Why the last layout request failed; cleared by the next successful one. */
  loadError: string | undefined = $state(undefined)
  readonly count = $derived(this.layout.length / LAYOUT_STRIDE)
  private readonly cards = new SvelteMap<number, ImageCard>()
  /** Ids already asked for (plain bookkeeping, deliberately not reactive). */
  private requested: Record<number, true> = {}
  private generation = 0
  /** Bumped by reload(); card fetches started before it are discarded. */
  private cardGeneration = 0
  private readonly scrollPositions: Record<string, number> = {}

  constructor(private readonly api: Pick<GenfolioApi, 'getImageLayout' | 'getImages'>) {}

  get key(): string | undefined {
    return this.query && queryKey(this.query)
  }

  async load(query: GalleryQuery): Promise<void> {
    const generation = ++this.generation
    this.query = query
    this.loading = true
    try {
      const layout = await this.api.getImageLayout(query)
      if (generation !== this.generation) return
      this.layout = layout
      this.loadError = undefined
    } catch (error) {
      if (generation === this.generation) this.loadError = userMessage(error)
    } finally {
      if (generation === this.generation) this.loading = false
    }
  }

  /** Reloads the current query and forgets cached cards (after a scan changed the library). */
  async reload(): Promise<void> {
    this.cardGeneration++
    this.cards.clear()
    this.requested = {}
    if (this.query) await this.load(this.query)
  }

  /** Remembers the scroll offset of the current query, to restore when it is shown again. */
  rememberScroll(offset: number): void {
    if (this.key) this.scrollPositions[this.key] = offset
  }

  savedScroll(): number {
    return (this.key && this.scrollPositions[this.key]) || 0
  }

  idAt(index: number): number {
    return this.layout[index * LAYOUT_STRIDE] ?? 0
  }

  sizeAt(index: number): { width: number; height: number } {
    const base = index * LAYOUT_STRIDE
    return { width: this.layout[base + 1] ?? 1, height: this.layout[base + 2] ?? 1 }
  }

  indexOf(imageId: number): number {
    for (let index = 0; index < this.count; index++) {
      if (this.idAt(index) === imageId) return index
    }
    return -1
  }

  card(imageId: number): ImageCard | undefined {
    return this.cards.get(imageId)
  }

  /**
   * Fetches cards not yet loaded or requested, at most 500 per request. A failed batch is
   * released so its ids are asked for again; results that arrive after a reload are dropped.
   */
  async ensureCards(ids: readonly number[]): Promise<void> {
    const generation = this.cardGeneration
    const missing = ids.filter((id) => !this.cards.has(id) && !this.requested[id])
    for (const id of missing) this.requested[id] = true
    for (let start = 0; start < missing.length; start += MAX_IMAGES_PER_REQUEST) {
      const batch = missing.slice(start, start + MAX_IMAGES_PER_REQUEST)
      let cards: readonly ImageCard[]
      try {
        cards = await this.api.getImages(batch)
      } catch {
        if (generation === this.cardGeneration) for (const id of batch) delete this.requested[id]
        continue
      }
      if (generation !== this.cardGeneration) return
      for (const card of cards) this.cards.set(card.id, card)
    }
  }
}
