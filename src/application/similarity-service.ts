import { HashTable } from '@domain/hash-table'
import type { ImageId } from '@domain/library'
import { HASH_VERSION } from '@domain/perceptual-hash'
import type { SimilarityRepository } from '@domain/repositories'
import { groupSimilar, SIMILAR_GROUPS_STALE_KEY, type SimilarPair } from '@domain/similarity'
import { GROUP_PREVIEW_SIZE, type SimilarGroupsPage } from '@shared/similarity'
import { DEFAULT_SIMILARITY_THRESHOLD, MAX_SIMILARITY_DISTANCE } from '@shared/similarity-kinds'

const THRESHOLD_KEY = 'similarity.threshold'
const PAIRS_KEY = 'similarity.pairs'
/** What stored pairs were computed with; different hashing or limits need them again. */
const PAIRS_VERSION = `${HASH_VERSION}:${MAX_SIMILARITY_DISTANCE}`
/** Images compared between yields, so the service keeps answering requests. */
const COMPARE_CHUNK = 256

/**
 * Keeps similar pairs and groups current: new hashes are compared with every hashed image,
 * pairs up to MAX_SIMILARITY_DISTANCE are stored, and groups are rebuilt at the user's
 * threshold whenever pairs, the threshold or the set of images change.
 */
export class SimilarityService {
  /** Comparisons run one after another: each reads and replaces pairs as a whole. */
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly repository: SimilarityRepository,
    /** Lets queued requests run between chunks of comparisons. */
    private readonly yieldToEvents: () => Promise<void>
  ) {}

  threshold(): number {
    const saved = Number(this.repository.setting(THRESHOLD_KEY))
    return Number.isInteger(saved) && saved >= 0 && saved <= MAX_SIMILARITY_DISTANCE
      ? saved
      : DEFAULT_SIMILARITY_THRESHOLD
  }

  /** `threshold` must be 0 to MAX_SIMILARITY_DISTANCE; regroups at once. */
  setThreshold(threshold: number): void {
    this.repository.saveSetting(THRESHOLD_KEY, String(threshold))
    this.regroup()
  }

  /** Compares these images' hashes with every hashed image, stores their pairs, regroups if any pair changed. */
  index(ids: readonly ImageId[]): Promise<void> {
    return this.serially(() => this.compare(ids))
  }

  /** Recomputes every pair when they were made by other hashing or limits (or never). */
  ensureCurrent(): Promise<void> {
    return this.serially(async () => {
      if (this.repository.setting(PAIRS_KEY) === PAIRS_VERSION) return
      await this.compare(this.repository.hashed().map((image) => image.id))
      this.repository.saveSetting(PAIRS_KEY, PAIRS_VERSION)
    })
  }

  /** A page of groups, largest first, each with its first members, keeper first. */
  groups(offset: number, limit: number): SimilarGroupsPage {
    return {
      total: this.repository.groupCount(),
      groups: this.repository.groups(offset, limit, GROUP_PREVIEW_SIZE)
    }
  }

  /** Every member of a group, the suggested keeper first; empty when there is no such group. */
  members(groupId: number): ImageId[] {
    return this.repository.members(groupId)
  }

  /**
   * Regroups when a grouped image changed or was deleted since the last regroup, however that
   * happened: the database remembers it, so a scan that stopped half-way or a restart is covered.
   * Images that were never grouped, and added ones (not hashed yet, so unpaired), cost nothing.
   */
  regroupIfStale(): void {
    if (this.groupsAreStale()) this.regroup()
  }

  /** Rebuilds every group from the stored pairs at the current threshold. */
  regroup(): void {
    const threshold = this.threshold()
    this.repository.writeGroups(groupSimilar(this.repository.pairsWithin(threshold), threshold))
    this.repository.saveSetting(SIMILAR_GROUPS_STALE_KEY, '0')
  }

  private groupsAreStale(): boolean {
    return this.repository.setting(SIMILAR_GROUPS_STALE_KEY) === '1'
  }

  private serially(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task)
    // A failed task must not stop the ones queued after it; the caller still sees it fail.
    this.queue = run.catch(() => undefined)
    return run
  }

  private async compare(ids: readonly ImageId[]): Promise<void> {
    const table = new HashTable(this.repository.hashed())
    const subjects = ids.filter((id) => table.has(id))
    const subjectSet = new Set<number>(subjects)
    const pairs: SimilarPair[] = []
    for (let start = 0; start < subjects.length; start += COMPARE_CHUNK) {
      for (const id of subjects.slice(start, start + COMPARE_CHUNK)) {
        // A pair of two subjects is found once, from the smaller id.
        pairs.push(
          ...table.pairsOf(
            id,
            MAX_SIMILARITY_DISTANCE,
            (other) => other < id && subjectSet.has(other)
          )
        )
      }
      await this.yieldToEvents()
    }
    const pairsChanged = this.repository.replacePairs(ids, pairs)
    if (pairsChanged || this.groupsAreStale()) this.regroup()
  }
}
