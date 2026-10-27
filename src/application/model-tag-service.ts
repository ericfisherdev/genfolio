import {
  DuplicateModelTagError,
  type ModelTagRecord,
  type ModelTagRepository,
  UnknownModelTagError
} from '@domain/repositories'
import { ChangeOutcome, type ModelTagChange } from '@shared/model-tags'
import type { ModelKey } from '@shared/models'

/**
 * Model tag commands for the UI: domain errors become outcomes (a duplicate name, a tag that
 * is gone) instead of failures, since both are ordinary results of what a user typed or of
 * another window acting first.
 */
export class ModelTagService {
  constructor(
    private readonly tags: ModelTagRepository,
    private readonly now: () => number
  ) {}

  list(): ModelTagRecord[] {
    return this.tags.list()
  }

  tagsOf(key: ModelKey): ModelTagRecord[] {
    return this.tags.tagsOf(key)
  }

  create(name: string): ModelTagChange {
    return this.outcome(() => this.tags.create(name, this.now()))
  }

  rename(id: number, name: string): ModelTagChange {
    return this.outcome(() => this.tags.rename(id, name))
  }

  delete(id: number): boolean {
    return this.tags.delete(id)
  }

  /** False when the model is not listed or the tag is gone; nothing is linked then. */
  apply(tagId: number, key: ModelKey): boolean {
    try {
      return this.tags.apply(tagId, key, this.now())
    } catch (error) {
      if (error instanceof UnknownModelTagError) return false
      throw error
    }
  }

  remove(tagId: number, key: ModelKey): boolean {
    return this.tags.remove(tagId, key)
  }

  private outcome(change: () => ModelTagRecord): ModelTagChange {
    try {
      return { outcome: ChangeOutcome.Done, tag: change() }
    } catch (error) {
      if (error instanceof DuplicateModelTagError) {
        return { outcome: ChangeOutcome.Duplicate, existing: error.existing }
      }
      if (error instanceof UnknownModelTagError) return { outcome: ChangeOutcome.Missing }
      throw error
    }
  }
}
