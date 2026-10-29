import type { GenfolioApi } from '@shared/genfolio-api'
import type { ModelStatsOverview } from '@shared/model-stats'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type ModelStatsApi = Pick<GenfolioApi, 'getModelStats'>

/**
 * How the library's checkpoints and LoRAs are used: the ranked overview, optionally narrowed
 * to the models carrying one model tag. Reports a failure in the notice bar, and as `failed`
 * so the page doesn't wait forever; never rejects.
 */
export class ModelStatsState {
  overview: ModelStatsOverview | undefined = $state.raw()
  /** Only models carrying this model tag, and the pairs with at least one such side. */
  modelTagId: number | undefined = $state()
  loading = $state(false)
  /** The latest request failed, so `overview` is missing or out of date. */
  failed = $state(false)

  /** Whether the overview was ever asked for; until then nothing needs keeping current. */
  private requested = false
  /** Drops the answer of a request that a newer one has overtaken. */
  private latest = 0

  constructor(
    private readonly api: ModelStatsApi,
    private readonly notices: NoticeSink
  ) {}

  /** Shows the overview for this tag (none: all models), loading it. */
  async show(modelTagId: number | undefined): Promise<void> {
    // Another tag's overview would show under this tag's name and hide a failure of this load.
    if (modelTagId !== this.modelTagId) this.overview = undefined
    this.modelTagId = modelTagId
    await this.load()
  }

  /** Reloads the overview after the library or the model tags changed, once it has been shown. */
  async refresh(): Promise<void> {
    if (this.requested) await this.load()
  }

  private async load(): Promise<void> {
    this.requested = true
    const request = ++this.latest
    this.loading = true
    try {
      const overview = await this.api.getModelStats(
        this.modelTagId === undefined ? undefined : { modelTagId: this.modelTagId }
      )
      if (request !== this.latest) return
      this.overview = overview
      this.failed = false
    } catch (error) {
      if (request !== this.latest) return
      this.failed = true
      this.notices.notify(`Could not load the model statistics: ${userMessage(error)}`)
    } finally {
      if (request === this.latest) this.loading = false
    }
  }
}
