import { ChangeOutcome } from '@shared/change-outcome'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { ModelKey } from '@shared/models'
import type { ModelTag, ModelTagRef } from '@shared/model-tags'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type ModelTagsApi = Pick<
  GenfolioApi,
  'listModelTags' | 'createModelTag' | 'applyModelTag' | 'removeModelTag'
>

/**
 * The model tags with how many models carry each, and the commands that tag a model. Separate
 * from the image tags. Every command reports problems (a model that is gone, a failure) in the
 * notice bar, reloads the list and calls `onchange` so views that show or filter by model tags
 * refresh. Never rejects.
 */
export class ModelTagsState {
  tags: readonly ModelTag[] = $state.raw([])

  constructor(
    private readonly api: ModelTagsApi,
    private readonly notices: NoticeSink,
    private readonly onchange: () => void
  ) {}

  async load(): Promise<void> {
    try {
      this.tags = await this.api.listModelTags()
    } catch (error) {
      this.notices.notify(`Could not load model tags: ${userMessage(error)}`)
    }
  }

  /** The tag with this name, creating it when there's none; `undefined` on failure. */
  async ensure(name: string): Promise<ModelTag | undefined> {
    const change = await this.attempt('create the tag', () => this.api.createModelTag(name))
    if (change?.outcome === ChangeOutcome.Done) return change.tag
    if (change?.outcome === ChangeOutcome.Duplicate) return change.existing
    return undefined
  }

  async apply(tag: ModelTagRef, model: ModelKey): Promise<void> {
    const applied = await this.attempt('tag the model', () => this.api.applyModelTag(tag.id, model))
    if (applied === false) this.notices.notify('That model or tag no longer exists.')
  }

  async remove(tag: ModelTagRef, model: ModelKey): Promise<void> {
    await this.attempt('remove the tag', () => this.api.removeModelTag(tag.id, model))
  }

  /** Runs a command, then reloads; `undefined` (with a notice) when it failed. */
  private async attempt<T>(description: string, command: () => Promise<T>): Promise<T | undefined> {
    try {
      return await command()
    } catch (error) {
      this.notices.notify(`Could not ${description}: ${userMessage(error)}`)
      return undefined
    } finally {
      await this.load()
      this.onchange()
    }
  }
}
