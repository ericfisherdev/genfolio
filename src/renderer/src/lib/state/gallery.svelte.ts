import { SvelteMap } from 'svelte/reactivity'
import type { GenfolioApi } from '@shared/genfolio-api'
import { LAYOUT_STRIDE, MAX_IMAGES_PER_REQUEST } from '@shared/gallery-kinds'
import type { GalleryQuery, ImageCard } from '@shared/gallery'
import { queryKey } from '../gallery/gallery-query'
import { userMessage } from '../format/user-message'

type MarkFields = Partial<Pick<ImageCard, 'favorite' | 'rating'>>

/** One optimistic change to cached cards, which can be undone if the write fails. */
export interface CardPatch {
  /**
   * Puts back each patched field of these images (default: all patched), unless a later
   * change or a reload has replaced the value this patch wrote.
   */
  revert(ids?: readonly number[]): void
}

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
  /** Marks changed the results while they were being stepped through; reload when shown. */
  layoutStale = $state(false)
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
    this.layoutStale = false
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

  /** Reloads the current query and forgets cached cards (after a failed load). */
  async reload(): Promise<void> {
    this.cardGeneration++
    this.cards.clear()
    this.requested = {}
    if (this.query) await this.load(this.query)
  }

  /**
   * Reloads the layout and fetches fresh copies of the cards already loaded, keeping the old
   * ones on screen until they arrive (after scans, deletions or regrouping changed the
   * library). Cards of images that are gone are dropped; a failed fetch keeps the old cards.
   */
  async refresh(): Promise<void> {
    const loaded = [...this.cards.keys()]
    await Promise.all([this.query ? this.load(this.query) : undefined, this.refetch(loaded)])
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
   * Changes cached cards in place (an optimistic update); cards not cached yet are fetched
   * fresh later anyway.
   */
  patchCards(ids: readonly number[], patch: MarkFields): CardPatch {
    const generation = this.cardGeneration
    // Plain bookkeeping for the revert, deliberately not reactive.
    const previous: Record<number, ImageCard> = {}
    for (const id of ids) {
      const card = this.cards.get(id)
      if (!card) continue
      previous[id] = card
      this.cards.set(id, { ...card, ...patch })
    }
    return {
      revert: (only = ids) => {
        // A reload refetched every card from the database, which never saw this patch.
        if (generation !== this.cardGeneration) return
        for (const id of only) {
          const before = previous[id]
          const now = this.cards.get(id)
          if (before && now) this.cards.set(id, revertedFields(now, before, patch))
        }
      }
    }
  }

  /** Loads the current query's layout again, keeping cached cards (after marks or tags changed). */
  async refreshLayout(): Promise<void> {
    if (this.query) await this.load(this.query)
  }

  /** Asks for the layout to be reloaded the next time the grid is shown (see layoutStale). */
  markLayoutStale(): void {
    this.layoutStale = true
  }

  /**
   * Fetches cards not yet loaded or requested, at most 500 per request. A failed batch is
   * released so its ids are asked for again; results that arrive after a reload are dropped.
   */
  private async refetch(ids: readonly number[]): Promise<void> {
    const generation = this.cardGeneration
    for (let start = 0; start < ids.length; start += MAX_IMAGES_PER_REQUEST) {
      const batch = ids.slice(start, start + MAX_IMAGES_PER_REQUEST)
      let fresh: readonly ImageCard[]
      try {
        fresh = await this.api.getImages(batch)
      } catch {
        continue
      }
      if (generation !== this.cardGeneration) return
      // Plain bookkeeping, deliberately not reactive.
      const kept: Record<number, true> = {}
      for (const card of fresh) {
        this.cards.set(card.id, card)
        kept[card.id] = true
      }
      for (const id of batch) if (!kept[id]) this.cards.delete(id)
    }
  }

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

/** `now` with each field `patch` wrote set back to `before`'s, where `now` still has it. */
function revertedFields(now: ImageCard, before: ImageCard, patch: MarkFields): ImageCard {
  const reverted = { ...now }
  if (patch.favorite !== undefined && now.favorite === patch.favorite) {
    reverted.favorite = before.favorite
  }
  if (patch.rating !== undefined && now.rating === patch.rating) reverted.rating = before.rating
  return reverted
}
