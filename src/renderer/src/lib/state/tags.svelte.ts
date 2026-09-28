import { MAX_IDS_PER_MARK } from '@shared/gallery-kinds'
import type { GenfolioApi } from '@shared/genfolio-api'
import { ChangeOutcome } from '@shared/change-outcome'
import type { Tag, TagChange } from '@shared/tags'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type TagsApi = Pick<
  GenfolioApi,
  'listTags' | 'createTag' | 'renameTag' | 'mergeTags' | 'deleteTag' | 'applyTags' | 'removeTags'
>

/**
 * The library's tags with counts, and the commands that change them. Every command reports
 * problems (a duplicate name, a tag that's gone, a failure) in the notice bar, reloads the
 * list and calls `onchange` so views that count or filter by tags refresh. Never rejects.
 */
export class TagsState {
  tags: readonly Tag[] = $state.raw([])

  constructor(
    private readonly api: TagsApi,
    private readonly notices: NoticeSink,
    private readonly onchange: () => void
  ) {}

  async load(): Promise<void> {
    try {
      this.tags = await this.api.listTags()
    } catch (error) {
      this.notices.notify(`Could not load tags: ${userMessage(error)}`)
    }
  }

  /** The tag with this name, creating it when there's none; `undefined` on failure. */
  async ensure(name: string): Promise<Tag | undefined> {
    const change = await this.attempt('create the tag', () => this.api.createTag(name))
    if (!change) return undefined
    if (change.outcome === ChangeOutcome.Done) return change.tag
    if (change.outcome === ChangeOutcome.Duplicate) return change.existing
    return undefined
  }

  async rename(tag: Tag, name: string): Promise<void> {
    const change = await this.attempt('rename the tag', () => this.api.renameTag(tag.id, name))
    this.report(change, `A tag named “${name}” already exists; merge into it instead.`)
  }

  async merge(from: Tag, into: Tag): Promise<void> {
    const change = await this.attempt('merge the tags', () => this.api.mergeTags(from.id, into.id))
    this.report(change, '')
  }

  async delete(tag: Tag): Promise<void> {
    await this.attempt('delete the tag', () => this.api.deleteTag(tag.id))
  }

  /** Resolves whether the tags were applied (a failure is already reported). */
  async apply(tags: readonly Tag[], imageIds: readonly number[]): Promise<boolean> {
    if (tags.length === 0 || imageIds.length === 0) return true
    const tagIds = tags.map((tag) => tag.id)
    const added = await this.attempt('tag the images', async () => {
      let total = 0
      for (let start = 0; start < imageIds.length; start += MAX_IDS_PER_MARK) {
        total += await this.api.applyTags(tagIds, imageIds.slice(start, start + MAX_IDS_PER_MARK))
      }
      return total
    })
    return added !== undefined
  }

  async remove(tags: readonly Tag[], imageIds: readonly number[]): Promise<void> {
    if (tags.length === 0 || imageIds.length === 0) return
    await this.attempt('remove the tag', () =>
      this.api.removeTags(
        tags.map((tag) => tag.id),
        imageIds
      )
    )
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

  private report(change: TagChange | undefined, duplicate: string): void {
    if (change?.outcome === ChangeOutcome.Duplicate && duplicate) this.notices.notify(duplicate)
    if (change?.outcome === ChangeOutcome.Missing) this.notices.notify('That tag no longer exists.')
  }
}
