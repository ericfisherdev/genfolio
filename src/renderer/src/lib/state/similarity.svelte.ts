import type { GenfolioApi } from '@shared/genfolio-api'
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  MAX_GROUPS_PER_PAGE,
  type SimilarGroup
} from '@shared/similarity'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type SimilarityApi = Pick<
  GenfolioApi,
  'getSimilarityThreshold' | 'setSimilarityThreshold' | 'listSimilarGroups'
>

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

  constructor(
    private readonly api: SimilarityApi,
    private readonly notices: NoticeSink,
    private readonly onregroup: () => void
  ) {}

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
