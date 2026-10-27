import type { ModelStatsOverview, ModelUsage } from '@shared/model-stats'
import type { ModelKey } from '@shared/models'

/** An overview request with its defaults applied. */
export interface OverviewRequest {
  /** Keeps tagged models and pairs with a tagged side; null for every model. */
  readonly modelTagId: number | null
  /** Rows per list. */
  readonly limit: number
}

/** Read-only usage statistics over the whole library; implemented over the library database. */
export interface ModelStatsReader {
  /**
   * Ranked checkpoints and LoRAs and their pairings. An unknown `modelTagId` is not an
   * error: it keeps nothing, so every list is empty.
   */
  overview(request: OverviewRequest): ModelStatsOverview
  /**
   * How the model is used, at most `limit` rows per list. `null` when no image uses it: it
   * is unknown, or listed only because the user added it by hand.
   */
  usage(key: ModelKey, limit: number): ModelUsage | null
}
