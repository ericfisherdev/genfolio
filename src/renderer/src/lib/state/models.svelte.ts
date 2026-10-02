import { ChangeOutcome } from '@shared/change-outcome'
import { CivitaiOutcome, type CivitaiCandidate, type CivitaiResult } from '@shared/civitai'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { ModelKind } from '@shared/generation-kinds'
import {
  MAX_MODELS_PER_PAGE,
  type ModelDetail,
  type ModelEntry,
  type ModelFields,
  type ModelKey,
  type ModelList
} from '@shared/models'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type ModelsApi = Pick<
  GenfolioApi,
  | 'listModels'
  | 'getModel'
  | 'saveModel'
  | 'createModel'
  | 'clearModel'
  | 'copyModelTriggerWords'
  | 'lookupModelOnCivitai'
  | 'searchCivitai'
  | 'linkModelToCivitai'
  | 'refreshModelFromCivitai'
  | 'unlinkModelFromCivitai'
  | 'openModelOnCivitai'
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
  /** A request to Civitai is in flight, so another one must wait. */
  civitaiBusy = $state(false)
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
      const shown = Math.max(this.items.length, MODELS_PAGE_SIZE)
      let items: ModelEntry[] = []
      let page: ModelList
      do {
        const limit = Math.min(MAX_MODELS_PER_PAGE, shown - items.length)
        page = await this.api.listModels(this.query(items.length, limit))
        if (request !== this.latestList) return
        items = [...items, ...page.items]
      } while (items.length < shown && items.length < page.total && page.items.length > 0)
      this.items = items
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

  /**
   * Looks the model up on Civitai by its file hashes. Resolves the outcome, or undefined when
   * Civitai couldn't answer (reported in the notice bar). NotFound is also reported, with what
   * to do next.
   */
  async lookupOnCivitai(key: ModelKey): Promise<CivitaiOutcome | undefined> {
    const outcome = await this.askCivitai('look the model up on Civitai', () =>
      this.api.lookupModelOnCivitai(key)
    )
    if (outcome === CivitaiOutcome.NotFound) {
      this.notices.notify(
        'No file of this model is on Civitai by its hash. Search Civitai by name.'
      )
    }
    return outcome
  }

  /** The versions matching, or undefined when Civitai couldn't answer (reported). */
  async searchCivitai(
    kind: ModelKind,
    text: string,
    identity: string
  ): Promise<readonly CivitaiCandidate[] | undefined> {
    let found: readonly CivitaiCandidate[] | undefined
    this.civitaiBusy = true
    await this.attempt('search Civitai', async () => {
      found = await this.api.searchCivitai({ kind, text, identity })
    })
    this.civitaiBusy = false
    return found
  }

  /** Links the model to the version; resolves whether it is now linked. */
  async linkToCivitai(key: ModelKey, candidate: CivitaiCandidate): Promise<boolean> {
    const outcome = await this.askCivitai('link the model', () =>
      this.api.linkModelToCivitai(key, candidate.modelId, candidate.versionId)
    )
    if (outcome === CivitaiOutcome.NotFound) {
      this.notices.notify('Civitai no longer has that model version.')
    }
    return outcome === CivitaiOutcome.Linked
  }

  async refreshFromCivitai(key: ModelKey): Promise<void> {
    const outcome = await this.askCivitai('refresh the model from Civitai', () =>
      this.api.refreshModelFromCivitai(key)
    )
    if (outcome === CivitaiOutcome.NotFound) {
      this.notices.notify('Civitai no longer has the linked model version.')
    }
    // Unlinked meanwhile: nothing was written, so show the model as it now is, unless the
    // user has since opened another one.
    if (outcome === CivitaiOutcome.Unlinked && sameKey(this.selected, key)) {
      await this.select(key)
    }
  }

  /** Forgets the link and what Civitai said; what the user wrote stays. */
  async unlinkFromCivitai(key: ModelKey): Promise<void> {
    await this.attempt('unlink the model', async () => {
      await this.api.unlinkModelFromCivitai(key)
    })
    await this.select(key)
    await this.load()
  }

  async openOnCivitai(key: ModelKey): Promise<void> {
    await this.attempt('open Civitai', async () => {
      if (!(await this.api.openModelOnCivitai(key)))
        this.notices.notify('This model is not linked.')
    })
  }

  /** Runs a Civitai request that links a model: shows the result and reloads the list. */
  private async askCivitai(
    description: string,
    request: () => Promise<CivitaiResult>
  ): Promise<CivitaiOutcome | undefined> {
    let outcome: CivitaiOutcome | undefined
    this.civitaiBusy = true
    await this.attempt(description, async () => {
      const result = await request()
      outcome = result.outcome
      if (result.outcome === CivitaiOutcome.Linked) {
        // The user may have opened another model while Civitai answered.
        if (sameKey(this.selected, result.model)) {
          this.latestDetail++
          this.detail = result.model
        }
      } else if (result.outcome === CivitaiOutcome.Missing) {
        this.notices.notify('That model is no longer listed.')
      }
    })
    this.civitaiBusy = false
    if (outcome === CivitaiOutcome.Linked) await this.load()
    return outcome
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
