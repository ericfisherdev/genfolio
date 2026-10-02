import type { CivitaiBrowseItem, CivitaiBrowseQuery } from '@shared/civitai-browse'
import type { GenfolioApi } from '@shared/genfolio-api'
import { ModelKind } from '@shared/generation-kinds'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type BrowseApi = Pick<GenfolioApi, 'browseCivitai'>

/**
 * Models found on Civitai, searched by name, type and base model, a page at a time. Nothing is
 * requested until `search` is called. Reports failures in the notice bar; never rejects.
 */
export class CivitaiBrowseState {
  text = $state('')
  kind: ModelKind = $state(ModelKind.Lora)
  baseModel = $state('')
  items: readonly CivitaiBrowseItem[] = $state.raw([])
  nextCursor: string | null = $state(null)
  /** Whether a search has been run, so "nothing found" isn't shown before one. */
  searched = $state(false)
  loading = $state(false)

  /** Drops the answer of a request that a newer one has overtaken. */
  private latest = 0
  /** The query the shown results came from; more pages continue it, not what is typed now. */
  private shown: CivitaiBrowseQuery | null = null

  constructor(
    private readonly api: BrowseApi,
    private readonly notices: NoticeSink
  ) {}

  /** Starts over from the first page with the current text, type and base model. */
  async search(): Promise<void> {
    const request = ++this.latest
    this.loading = true
    const query = this.query()
    await this.attempt('search Civitai', async () => {
      const page = await this.api.browseCivitai(query)
      if (request !== this.latest) return
      this.shown = query
      this.items = page.items
      this.nextCursor = page.nextCursor
      this.searched = true
    })
    if (request === this.latest) this.loading = false
  }

  async loadMore(): Promise<void> {
    const { nextCursor, shown } = this
    if (nextCursor === null || shown === null || this.loading) return
    const request = ++this.latest
    this.loading = true
    await this.attempt('load more from Civitai', async () => {
      const page = await this.api.browseCivitai({ ...shown, cursor: nextCursor })
      if (request !== this.latest) return
      this.items = [...this.items, ...page.items]
      this.nextCursor = page.nextCursor
    })
    if (request === this.latest) this.loading = false
  }

  /** A different type has a different set of models, so the results are dropped and searched again. */
  async setKind(kind: ModelKind): Promise<void> {
    this.kind = kind
    this.items = []
    this.nextCursor = null
    await this.search()
  }

  private query(): CivitaiBrowseQuery {
    return {
      kind: this.kind,
      ...(this.text.trim() ? { text: this.text.trim() } : {}),
      ...(this.baseModel.trim() ? { baseModel: this.baseModel.trim() } : {})
    }
  }

  private async attempt(description: string, work: () => Promise<void>): Promise<void> {
    try {
      await work()
    } catch (error) {
      this.notices.notify(`Could not ${description}: ${userMessage(error)}`)
    }
  }
}
