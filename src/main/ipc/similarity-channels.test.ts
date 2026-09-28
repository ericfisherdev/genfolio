import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerSimilarityChannels } from './similarity-channels'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

type Handler = (...args: unknown[]) => unknown

function setup(): {
  invoke: (channel: IpcChannel, ...args: unknown[]) => unknown
  request: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<IpcChannel, { schema: z.ZodType; handler: Handler }>()
  const registry: IpcHandlerRegistry = {
    register: (channel, schema, handler) =>
      handlers.set(channel, { schema, handler: handler as Handler })
  }
  const request = vi.fn(async () => ({ deleted: true, changed: 3 }))
  registerSimilarityChannels(registry, { request } as unknown as ServiceRequester)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request }
}

describe('registerSimilarityChannels', () => {
  it('validates the threshold and the page, and returns the service values', async () => {
    const { invoke, request } = setup()
    request.mockResolvedValue({ threshold: 6 })
    await expect(invoke(IpcChannel.SetSimilarityThreshold, 6)).resolves.toBe(6)
    expect(request).toHaveBeenCalledWith(ServiceMethod.SetSimilarityThreshold, { threshold: 6 })
    expect(() => invoke(IpcChannel.SetSimilarityThreshold, 17)).toThrow()
    expect(() => invoke(IpcChannel.SetSimilarityThreshold, 2.5)).toThrow()
    await invoke(IpcChannel.SimilarGroups, 0, 100)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.SimilarGroups, { offset: 0, limit: 100 })
    expect(() => invoke(IpcChannel.SimilarGroups, 0, 101)).toThrow()
  })
})
