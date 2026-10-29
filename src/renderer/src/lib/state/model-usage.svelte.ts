import type { GenfolioApi } from '@shared/genfolio-api'
import type { ModelKey } from '@shared/models'
import type { ModelUsage } from '@shared/model-stats'
import type { ModelTagRef } from '@shared/model-tags'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type ModelUsageApi = Pick<GenfolioApi, 'getModelUsage' | 'getModel'>

/** The model a drill-down is about: enough to name it and to edit its tags. */
export interface UsageSubject extends ModelKey {
  readonly name: string
  readonly tags: readonly ModelTagRef[]
}

/**
 * How one checkpoint or LoRA is used: the partners it appears with. A model no image uses,
 * such as one added by hand, has a `subject` but no `usage`; an unknown one has neither.
 * Reports a failure in the notice bar, and as `failed` so the page doesn't wait forever;
 * never rejects.
 */
export class ModelUsageState {
  /** The model being shown; undefined until `show` is called. */
  key: ModelKey | undefined = $state.raw()
  /** The model's usage; undefined while loading, and for a model no image uses. */
  usage: ModelUsage | undefined = $state.raw()
  /** The model, when the library or the user's own list knows it; undefined while loading. */
  subject: UsageSubject | undefined = $state.raw()
  /** The answer for `key` has arrived, so an absent `usage` means "not used". */
  loaded = $state(false)
  loading = $state(false)
  /** The latest request failed, so what is shown is missing or out of date. */
  failed = $state(false)

  /** Drops the answer of a request that a newer one has overtaken. */
  private latest = 0

  constructor(
    private readonly api: ModelUsageApi,
    private readonly notices: NoticeSink
  ) {}

  /** Shows this model, loading its usage and clearing what the previous model showed. */
  async show(key: ModelKey): Promise<void> {
    this.key = key
    this.usage = undefined
    this.subject = undefined
    this.loaded = false
    this.failed = false
    await this.load(key)
  }

  /** Reloads after the library or the model tags changed, once a model has been shown. */
  async refresh(): Promise<void> {
    if (this.key) await this.load(this.key)
  }

  private async load(key: ModelKey): Promise<void> {
    const request = ++this.latest
    this.loading = true
    try {
      const usage = await this.api.getModelUsage(key)
      const subject = usage ? usage.model : ((await this.api.getModel(key)) ?? undefined)
      if (request !== this.latest) return
      this.usage = usage ?? undefined
      this.subject = subject
      this.loaded = true
      this.failed = false
    } catch (error) {
      if (request !== this.latest) return
      this.failed = true
      this.notices.notify(`Could not load how the model is used: ${userMessage(error)}`)
    } finally {
      if (request === this.latest) this.loading = false
    }
  }
}
