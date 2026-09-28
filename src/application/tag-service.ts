import type { ImageId } from '@domain/library'
import {
  DuplicateTagError,
  type TagRecord,
  type TagRepository,
  UnknownTagError
} from '@domain/repositories'
import { type TagChange, TagOutcome } from '@shared/tags'

/**
 * Tag commands for the UI: domain errors become outcomes (a duplicate name, a tag that is
 * gone) instead of failures, since both are ordinary results of what a user typed or of
 * another window acting first.
 */
export class TagService {
  constructor(
    private readonly tags: TagRepository,
    private readonly now: () => number
  ) {}

  list(): TagRecord[] {
    return this.tags.list()
  }

  tagsOf(imageId: ImageId): TagRecord[] {
    return this.tags.tagsOf(imageId)
  }

  create(name: string): TagChange {
    return this.outcome(() => this.tags.create(name, this.now()))
  }

  rename(id: number, name: string): TagChange {
    return this.outcome(() => this.tags.rename(id, name))
  }

  merge(from: number, into: number): TagChange {
    return this.outcome(() => this.tags.merge(from, into))
  }

  delete(id: number): boolean {
    return this.tags.delete(id)
  }

  apply(tagIds: readonly number[], imageIds: readonly ImageId[]): number {
    return this.tags.apply(tagIds, imageIds)
  }

  remove(tagIds: readonly number[], imageIds: readonly ImageId[]): number {
    return this.tags.remove(tagIds, imageIds)
  }

  private outcome(change: () => TagRecord): TagChange {
    try {
      return { outcome: TagOutcome.Done, tag: change() }
    } catch (error) {
      if (error instanceof DuplicateTagError) {
        return { outcome: TagOutcome.Duplicate, existing: error.existing }
      }
      if (error instanceof UnknownTagError) return { outcome: TagOutcome.Missing }
      throw error
    }
  }
}
