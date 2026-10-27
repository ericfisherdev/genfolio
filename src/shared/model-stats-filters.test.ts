import { describe, expect, it } from 'vitest'
import { ModelKind } from './generation-kinds'
import { filtersFor } from './model-stats-filters'
import { searchFiltersSchema, SetMatchMode } from './search'

const checkpoint = { id: 3, kind: ModelKind.Checkpoint }
const lora = { id: 8, kind: ModelKind.Lora }
const otherLora = { id: 11, kind: ModelKind.Lora }

describe('filtersFor', () => {
  it('filters a checkpoint, which the gallery matches as model or refiner', () => {
    expect(filtersFor(checkpoint)).toEqual({ checkpointIds: [3] })
  })

  it('filters a LoRA by any link, with no weight bound', () => {
    expect(filtersFor(lora)).toEqual({ loras: { ids: [8], mode: SetMatchMode.Any } })
  })

  it('filters a checkpoint with a LoRA by both', () => {
    expect(filtersFor({ first: checkpoint, second: lora })).toEqual({
      checkpointIds: [3],
      loras: { ids: [8], mode: SetMatchMode.Any }
    })
  })

  it('filters two LoRAs by all of them', () => {
    expect(filtersFor({ first: lora, second: otherLora })).toEqual({
      loras: { ids: [8, 11], mode: SetMatchMode.All }
    })
  })

  it('produces filters the gallery accepts', () => {
    for (const row of [checkpoint, lora, { first: checkpoint, second: lora }]) {
      expect(searchFiltersSchema.safeParse(filtersFor(row)).success).toBe(true)
    }
  })

  it('refuses a pair that is not oriented checkpoint first, or has two checkpoints', () => {
    expect(() => filtersFor({ first: lora, second: checkpoint })).toThrow(/checkpoint and a LoRA/)
    expect(() => filtersFor({ first: checkpoint, second: checkpoint })).toThrow()
  })
})
