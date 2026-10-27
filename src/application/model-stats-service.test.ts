import { describe, expect, it, vi } from 'vitest'
import type { ChangeCounter } from '@domain/change-counter'
import type { ModelStatsReader } from '@domain/model-stats-reader'
import { ModelKind } from '@shared/generation-kinds'
import type { ModelStatsOverview, ModelUsage } from '@shared/model-stats'
import { DEFAULT_STATS_ROWS } from '@shared/model-stats-kinds'
import { ModelStatsService } from './model-stats-service'

const empty: ModelStatsOverview = {
  checkpoints: [],
  loras: [],
  checkpointLoraPairs: [],
  loraPairs: []
}
const detail = { kind: ModelKind.Lora, identity: 'detail' }

function setup(usage: ModelUsage | null = null): {
  service: ModelStatsService
  reader: { overview: ReturnType<typeof vi.fn>; usage: ReturnType<typeof vi.fn> }
  changes: { value: number }
} {
  const reader = {
    overview: vi.fn(() => ({ ...empty })),
    usage: vi.fn(() => usage)
  }
  const changes = { value: 0 }
  const counter: ChangeCounter = { current: () => changes.value }
  return {
    service: new ModelStatsService(reader as unknown as ModelStatsReader, counter),
    reader,
    changes
  }
}

describe('ModelStatsService', () => {
  it('asks for every model and the default rows when the query names none', () => {
    const { service, reader } = setup()
    service.overview()
    expect(reader.overview).toHaveBeenCalledWith({ modelTagId: null, limit: DEFAULT_STATS_ROWS })
    service.overview({ modelTagId: 3, limit: 10 })
    expect(reader.overview).toHaveBeenLastCalledWith({ modelTagId: 3, limit: 10 })
  })

  it('answers a repeated overview from memory while nothing is written', () => {
    const { service, reader } = setup()
    const first = service.overview({ modelTagId: 3 })
    expect(service.overview({ modelTagId: 3 })).toBe(first)
    expect(reader.overview).toHaveBeenCalledTimes(1)
  })

  it('remembers each query apart', () => {
    const { service, reader } = setup()
    service.overview()
    service.overview({ modelTagId: 3 })
    service.overview({ limit: 5 })
    expect(reader.overview).toHaveBeenCalledTimes(3)
  })

  it('computes again once any write moved the counter', () => {
    const { service, reader, changes } = setup()
    service.overview()
    service.usage(detail)
    changes.value += 1
    service.overview()
    service.usage(detail)
    expect(reader.overview).toHaveBeenCalledTimes(2)
    expect(reader.usage).toHaveBeenCalledTimes(2)
  })

  it('remembers that a model has no usage', () => {
    const { service, reader } = setup(null)
    expect(service.usage(detail)).toBeNull()
    expect(service.usage(detail)).toBeNull()
    expect(reader.usage).toHaveBeenCalledTimes(1)
    expect(reader.usage).toHaveBeenCalledWith(detail, DEFAULT_STATS_ROWS)
  })

  it('keeps usage of different models and limits apart', () => {
    const { service, reader } = setup()
    service.usage(detail)
    service.usage({ kind: ModelKind.Checkpoint, identity: 'detail' })
    service.usage(detail, 5)
    expect(reader.usage).toHaveBeenCalledTimes(3)
  })

  it('holds a bounded number of answers, dropping the oldest', () => {
    const { service, reader } = setup()
    for (let tag = 1; tag <= 40; tag++) service.overview({ modelTagId: tag })
    reader.overview.mockClear()
    service.overview({ modelTagId: 40 })
    expect(reader.overview).not.toHaveBeenCalled()
    service.overview({ modelTagId: 1 })
    expect(reader.overview).toHaveBeenCalledTimes(1)
  })
})
