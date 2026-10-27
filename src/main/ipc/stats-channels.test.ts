import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { DEFAULT_STATS_ROWS, MAX_STATS_ROWS } from '@shared/model-stats-kinds'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerStatsChannels } from './stats-channels'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

type Handler = (...args: unknown[]) => unknown

const detail = { kind: 'lora', identity: 'detail' }

function setup(): {
  invoke: (channel: IpcChannel, ...args: unknown[]) => unknown
  request: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<IpcChannel, { schema: z.ZodType; handler: Handler }>()
  const registry: IpcHandlerRegistry = {
    register: (channel, schema, handler) =>
      handlers.set(channel, { schema, handler: handler as Handler })
  }
  const request = vi.fn(async () => null)
  registerStatsChannels(registry, { request } as unknown as ServiceRequester)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request }
}

describe('registerStatsChannels', () => {
  it('forwards an overview query, or an empty one when none is given', async () => {
    const { invoke, request } = setup()
    await invoke(IpcChannel.StatsOverview)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.StatsOverview, {})
    await invoke(IpcChannel.StatsOverview, undefined)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.StatsOverview, {})
    await invoke(IpcChannel.StatsOverview, { modelTagId: 3, limit: 10 })
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.StatsOverview, {
      modelTagId: 3,
      limit: 10
    })
  })

  it('rejects an overview query with a bad tag id, limit or extra field', () => {
    const { invoke } = setup()
    expect(() => invoke(IpcChannel.StatsOverview, { modelTagId: 0 })).toThrow()
    expect(() => invoke(IpcChannel.StatsOverview, { limit: 0 })).toThrow()
    expect(() => invoke(IpcChannel.StatsOverview, { limit: MAX_STATS_ROWS + 1 })).toThrow()
    expect(() => invoke(IpcChannel.StatsOverview, { extra: 1 })).toThrow()
  })

  it('forwards a model key with the default or the given limit', async () => {
    const { invoke, request } = setup()
    await invoke(IpcChannel.StatsModelUsage, detail)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.StatsModelUsage, {
      key: detail,
      limit: DEFAULT_STATS_ROWS
    })
    await invoke(IpcChannel.StatsModelUsage, detail, 7)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.StatsModelUsage, {
      key: detail,
      limit: 7
    })
  })

  it('rejects a malformed model key or limit', () => {
    const { invoke } = setup()
    expect(() => invoke(IpcChannel.StatsModelUsage)).toThrow()
    expect(() => invoke(IpcChannel.StatsModelUsage, { kind: 'refiner', identity: 'x' })).toThrow()
    expect(() => invoke(IpcChannel.StatsModelUsage, { ...detail, extra: 1 })).toThrow()
    expect(() => invoke(IpcChannel.StatsModelUsage, detail, 0)).toThrow()
  })
})
