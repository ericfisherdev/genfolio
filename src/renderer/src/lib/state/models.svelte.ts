import { ChangeOutcome } from '@shared/change-outcome'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { ModelKind } from '@shared/generation-kinds'
import {
  MAX_MODELS_PER_PAGE,
  type ModelDetail,
  type ModelEntry,
  type ModelFields,
  type ModelKey
} from '@shared/models'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type ModelsApi = Pick<
  GenfolioApi,
  'listModels' | 'getModel' | 'saveModel' | 'createModel' | 'clearModel' | 'copyModelTriggerWords'
>

/** Models listed at a time; "Show more" adds another page. */
export const MODELS_PAGE_SIZE = 100

const sameKey = (a: ModelKey | undefined, b: ModelKey | undefined): boolean =>
  a !== undefined && b !== undefined && a.kind === b.kind && a.identity === b.identity

/**
 * The checkpoints and LoRAs the library uses and those added by hand, searched by name, base
 * model, trigger words and notes, with the chosen model's details. Reports failures in the
 * notice bar; never rejects.
 */
export class ModelsState {
  items: readonly ModelEntry[] = $state.raw([])
  total = $state(0)
  baseModels: readonly string[] = $state.raw([])
  loaded = $state(false)
  text = $state('')
  kind: ModelKind | undefined = $state()
  baseModel: string | undefined = $state()
  withoutInfo = $state(false)
  selected: ModelKey | undefined = $state.raw()
  detail: ModelDetail | undefined = $state.raw()

  /** Drops the answer of a request that a newer one has overtaken. */
  private latestList = 0
  private latestDetail = 0

  constructor(
    private readonly api: ModelsApi,
    private readonly notices: NoticeSink
  ) {}

  /** Reloads the list from the first model, keeping as many as were shown. */
  async load(): Promise<void> {
    const request = ++this.latestList
    await this.attempt('load the models', async () => {
      const limit = Math.min(MAX_MODELS_PER_PAGE, Math.max(this.items.length, MODELS_PAGE_SIZE))
      const page = await this.api.listModels(this.query(0, limit))
      if (request !== this.latestList) return
      this.items = page.items
      this.total = page.total
      this.baseModels = page.baseModels
      this.loaded = true
    })
  }

  async loadMore(): Promise<void> {
    const request = ++this.latestList
    await this.attempt('load more models', async () => {
      const page = await this.api.listModels(this.query(this.items.length, MODELS_PAGE_SIZE))
      if (request !== this.latestList) return
      this.items = [...this.items, ...page.items]
      this.total = page.total
    })
  }

  /** Changes what the list shows, from the first model. */
  async filter(changes: {
    text?: string
    kind?: ModelKind | undefined
    baseModel?: string | undefined
    withoutInfo?: boolean
  }): Promise<void> {
    if ('text' in changes) this.text = changes.text ?? ''
    if ('kind' in changes) this.kind = changes.kind
    if ('baseModel' in changes) this.baseModel = changes.baseModel
    if ('withoutInfo' in changes) this.withoutInfo = changes.withoutInfo ?? false
    this.items = []
    await this.load()
  }

  /** Shows a model's details; undefined closes them. */
  async select(key: ModelKey | undefined): Promise<void> {
    this.selected = key
    const request = ++this.latestDetail
    if (!key) {
      this.detail = undefined
      return
    }
    await this.attempt('load the model', async () => {
      const detail = await this.api.getModel(key)
      if (request === this.latestDetail) this.detail = detail ?? undefined
    })
  }

  /** Resolves whether the fields were stored. */
  async save(key: ModelKey, fields: ModelFields): Promise<boolean> {
    let stored = false
    await this.attempt('save the model', async () => {
      const change = await this.api.saveModel(key, fields)
      if (change.outcome === ChangeOutcome.Done) {
        stored = true
        if (sameKey(this.selected, key)) this.detail = change.model
      } else {
        this.notices.notify('That model is no longer listed.')
      }
    })
    await this.load()
    return stored
  }

  /**
   * Adds a model by name and shows it; one that already has an entry is shown instead, with a
   * notice. Resolves whether a model is now shown (false: a failure, already reported).
   */
  async create(kind: ModelKind, name: string, fields: ModelFields): Promise<boolean> {
    let shown = false
    await this.attempt('add the model', async () => {
      const change = await this.api.createModel(kind, name, fields)
      if (change.outcome === ChangeOutcome.Missing) return
      const model = change.outcome === ChangeOutcome.Done ? change.model : change.existing
      if (change.outcome === ChangeOutcome.Duplicate) {
        this.notices.notify(`${model.name} already has an entry.`)
      }
      this.selected = { kind: model.kind, identity: model.identity }
      this.detail = model
      shown = true
    })
    await this.load()
    return shown
  }

  /** Forgets what was recorded; a model the library uses stays listed. */
  async clear(key: ModelKey): Promise<void> {
    await this.attempt('clear the model', async () => {
      await this.api.clearModel(key)
    })
    await this.select(key)
    await this.load()
  }

  /** Copies the trigger words (in main); notes when there are none. */
  async copyTriggerWords(key: ModelKey): Promise<void> {
    await this.attempt('copy the trigger words', async () => {
      if (!(await this.api.copyModelTriggerWords(key))) {
        this.notices.notify('This model has no trigger words.')
      }
    })
  }

  private query(offset: number, limit: number): Parameters<ModelsApi['listModels']>[0] {
    return {
      offset,
      limit,
      ...(this.text.trim() ? { text: this.text.trim() } : {}),
      ...(this.kind ? { kind: this.kind } : {}),
      ...(this.baseModel ? { baseModel: this.baseModel } : {}),
      ...(this.withoutInfo ? { withoutInfo: true as const } : {})
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
