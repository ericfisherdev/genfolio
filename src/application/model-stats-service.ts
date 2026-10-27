import type { ChangeCounter } from '@domain/change-counter'
import type { ModelStatsReader } from '@domain/model-stats-reader'
import type { ModelStatsOverview, ModelStatsQuery, ModelUsage } from '@shared/model-stats'
import { DEFAULT_STATS_ROWS } from '@shared/model-stats-kinds'
import type { ModelKey } from '@shared/models'

/** Most answers kept; the oldest is dropped first. */
const MAX_REMEMBERED = 32

/**
 * Model usage statistics for the Stats page. Computing them scans every generation (a cold
 * overview takes hundreds of milliseconds at 100k images, blocking the service), so answers
 * are remembered per request and forgotten as soon as the change counter moves: a stale
 * count is never served, at the price of recomputing after unrelated writes.
 *
 * Neither method throws domain errors: an unknown model tag keeps nothing, and an unknown
 * model has no usage.
 */
export class ModelStatsService {
  private readonly answers = new Map<string, unknown>()
  private seen: number | undefined

  constructor(
    private readonly reader: ModelStatsReader,
    private readonly changes: ChangeCounter
  ) {}

  overview(query: ModelStatsQuery = {}): ModelStatsOverview {
    const modelTagId = query.modelTagId ?? null
    const limit = query.limit ?? DEFAULT_STATS_ROWS
    return this.remember(['overview', modelTagId, limit], () =>
      this.reader.overview({ modelTagId, limit })
    )
  }

  /** How the model is used; null when no image uses it (unknown, or only added by hand). */
  usage(key: ModelKey, limit: number = DEFAULT_STATS_ROWS): ModelUsage | null {
    return this.remember(['usage', key.kind, key.identity, limit], () =>
      this.reader.usage(key, limit)
    )
  }

  private remember<T>(request: readonly unknown[], compute: () => T): T {
    const counted = this.changes.current()
    if (counted !== this.seen) {
      this.answers.clear()
      this.seen = counted
    }
    const key = JSON.stringify(request)
    if (this.answers.has(key)) return this.answers.get(key) as T
    const answer = compute()
    if (this.answers.size >= MAX_REMEMBERED) this.forgetOldest()
    this.answers.set(key, answer)
    return answer
  }

  private forgetOldest(): void {
    const [oldest] = this.answers.keys()
    if (oldest !== undefined) this.answers.delete(oldest)
  }
}
