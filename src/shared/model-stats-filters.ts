import { ModelKind } from './generation-kinds'
import type { SearchFilters } from './search'
import { SetMatchMode } from './search-kinds'

/** What a stats row needs to name a model in a gallery filter. */
interface ModelHandle {
  readonly id: number
  readonly kind: ModelKind
}

/** A ranked model, or a pair as the stats lists orient it (see `ModelPair`). */
export type StatsRow = ModelHandle | { readonly first: ModelHandle; readonly second: ModelHandle }

/**
 * The gallery filters that show exactly the images a stats row counts. A checkpoint matches
 * as model or refiner, as the checkpoint filter does, and LoRA weights are not bounded.
 *
 * @throws Error when a pair is not a checkpoint followed by a LoRA, or two LoRAs.
 */
export function filtersFor(row: StatsRow): SearchFilters {
  return 'first' in row ? pairFilters(row.first, row.second) : modelFilters(row)
}

function modelFilters({ id, kind }: ModelHandle): SearchFilters {
  return kind === ModelKind.Checkpoint
    ? { checkpointIds: [id] }
    : { loras: { ids: [id], mode: SetMatchMode.Any } }
}

function pairFilters(first: ModelHandle, second: ModelHandle): SearchFilters {
  if (first.kind === ModelKind.Checkpoint && second.kind === ModelKind.Lora) {
    return { ...modelFilters(first), ...modelFilters(second) }
  }
  if (first.kind === ModelKind.Lora && second.kind === ModelKind.Lora) {
    return { loras: { ids: [first.id, second.id], mode: SetMatchMode.All } }
  }
  throw new Error(
    `a stats pair is a checkpoint and a LoRA, or two LoRAs; got ${first.kind} and ${second.kind}`
  )
}
