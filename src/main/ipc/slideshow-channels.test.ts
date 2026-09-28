import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerSlideshowChannels } from './slideshow-channels'
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
  registerSlideshowChannels(registry, { request } as unknown as ServiceRequester)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request }
}

describe('registerSlideshowChannels', () => {
  it('validates names and settings and forwards them', async () => {
    const { invoke, request } = setup()
    const settings = { intervalMs: 5_000, shuffle: false, loop: true, showPrompt: false }
    await invoke(IpcChannel.SavePreset, '  Calm  ', settings)
    expect(request).toHaveBeenCalledWith(ServiceMethod.PresetsSave, { name: 'Calm', settings })
    expect(() => invoke(IpcChannel.SavePreset, 'Calm', { ...settings, intervalMs: 100 })).toThrow()
    expect(() => invoke(IpcChannel.SavePreset, 'Calm', { ...settings, extra: 1 })).toThrow()
    await expect(invoke(IpcChannel.DeletePreset, 2)).resolves.toBe(true)
  })
})
