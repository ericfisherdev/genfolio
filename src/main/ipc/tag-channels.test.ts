import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerTagChannels } from './tag-channels'
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
  registerTagChannels(registry, { request } as unknown as ServiceRequester)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request }
}

describe('registerTagChannels', () => {
  it('trims names and rejects blank, long or control-character names', async () => {
    const { invoke, request } = setup()
    await invoke(IpcChannel.CreateTag, '  keeper  ')
    expect(request).toHaveBeenCalledWith(ServiceMethod.TagsCreate, { name: 'keeper' })
    expect(() => invoke(IpcChannel.CreateTag, '   ')).toThrow()
    expect(() => invoke(IpcChannel.CreateTag, 'x'.repeat(65))).toThrow()
    expect(() => invoke(IpcChannel.RenameTag, 1, 'bad\u0007name')).toThrow()
  })

  it('forwards bulk apply and returns the count', async () => {
    const { invoke, request } = setup()
    await expect(invoke(IpcChannel.ApplyTags, [1], [2, 3])).resolves.toBe(3)
    expect(request).toHaveBeenCalledWith(ServiceMethod.TagsApply, { tagIds: [1], imageIds: [2, 3] })
    expect(() => invoke(IpcChannel.ApplyTags, [], [2])).toThrow()
    await expect(invoke(IpcChannel.DeleteTag, 4)).resolves.toBe(true)
  })
})
