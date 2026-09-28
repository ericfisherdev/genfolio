import type { GenfolioApi } from '@shared/genfolio-api'
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  MAX_GROUPS_PER_PAGE,
  type SimilarGroup
} from '@shared/similarity'
import { SvelteMap } from 'svelte/reactivity'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type SimilarityApi = Pick<
  GenfolioApi,
  | 'getSimilarityThreshold'
  | 'setSimilarityThreshold'
  | 'listSimilarGroups'
  | 'listSimilarGroupMembers'
>

/** Moves images to the trash; resolves whether anything left the library. */
export type TrashImages = (imageIds: readonly number[]) => Promise<boolean>

/**
 * The look-alike groups (largest first, a page at a time) and the threshold that makes them.
 * Changing the threshold regroups in the service, then calls `onregroup` so cards and views
 * that show groups reload. Reports failures in the notice bar; never rejects.
 */
export class SimilarityState {
  threshold = $state(DEFAULT_SIMILARITY_THRESHOLD)
  groups: readonly SimilarGroup[] = $state.raw([])
  total = $state(0)
  loaded = $state(false)
  /** Keepers the user chose over the suggestion, per group; kept for this session only. */
  readonly chosenKeepers = new SvelteMap<number, number>()

  constructor(
    private readonly api: SimilarityApi,
    private readonly notices: NoticeSink,
    private readonly onregroup: () => void,
    private readonly trash: TrashImages
  ) {}

  /** Keeps `imageId` instead of the suggested keeper when the group is cleaned up. */
  keep(groupId: number, imageId: number): void {
    this.chosenKeepers.set(groupId, imageId)
  }

  /**
   * The group's members with the keeper first: the one the user chose, else the suggestion
   * (most pixels, largest file, oldest). Empty when the group is gone.
   */
  async membersKeeperFirst(groupId: number): Promise<number[]> {
    let members: readonly number[] = []
    await this.attempt('load the group', async () => {
      members = await this.api.listSimilarGroupMembers(groupId)
    })
    const chosen = this.chosenKeepers.get(groupId)
    return chosen !== undefined && members.includes(chosen)
      ? [chosen, ...members.filter((id) => id !== chosen)]
      : [...members]
  }

  /** Moves every member but the keeper to the trash, then reloads the groups. */
  async trashAllButKeeper(groupId: number): Promise<void> {
    const [, ...others] = await this.membersKeeperFirst(groupId)
    if (others.length === 0) return
    if (await this.trash(others)) this.chosenKeepers.delete(groupId)
    await this.load()
  }

  /** Reloads the threshold and the first page of groups. */
  async load(): Promise<void> {
    await this.attempt('load the look-alikes', async () => {
      const [threshold, page] = await Promise.all([
        this.api.getSimilarityThreshold(),
        this.api.listSimilarGroups(0, MAX_GROUPS_PER_PAGE)
      ])
      this.threshold = threshold
      this.groups = page.groups
      this.total = page.total
      this.loaded = true
    })
  }

  async loadMore(): Promise<void> {
    await this.attempt('load more look-alikes', async () => {
      const page = await this.api.listSimilarGroups(this.groups.length, MAX_GROUPS_PER_PAGE)
      this.groups = [...this.groups, ...page.groups]
      this.total = page.total
    })
  }

  async setThreshold(threshold: number): Promise<void> {
    await this.attempt('change the threshold', async () => {
      this.threshold = await this.api.setSimilarityThreshold(threshold)
    })
    await this.load()
    this.onregroup()
  }

  /** The size of a loaded group, if it is among the loaded pages. */
  sizeOf(groupId: number): number | undefined {
    return this.groups.find((group) => group.groupId === groupId)?.count
  }

  private async attempt(description: string, work: () => Promise<void>): Promise<void> {
    try {
      await work()
    } catch (error) {
      this.notices.notify(`Could not ${description}: ${userMessage(error)}`)
    }
  }
}
