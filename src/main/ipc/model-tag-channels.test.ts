import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerModelTagChannels } from './model-tag-channels'
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
  const request = vi.fn(async () => ({ deleted: true, applied: true, removed: false }))
  registerModelTagChannels(registry, { request } as unknown as ServiceRequester)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request }
}

describe('registerModelTagChannels', () => {
  it('trims names and rejects blank, long or control-character names', async () => {
    const { invoke, request } = setup()
    await invoke(IpcChannel.CreateModelTag, '  lighting  ')
    expect(request).toHaveBeenCalledWith(ServiceMethod.ModelTagsCreate, { name: 'lighting' })
    expect(() => invoke(IpcChannel.CreateModelTag, '   ')).toThrow()
    expect(() => invoke(IpcChannel.CreateModelTag, 'x'.repeat(65))).toThrow()
    expect(() => invoke(IpcChannel.RenameModelTag, 1, 'bad\u0007name')).toThrow()
  })

  it('forwards a tag and a model key and unwraps the answer', async () => {
    const { invoke, request } = setup()
    await expect(invoke(IpcChannel.ApplyModelTag, 3, detail)).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith(ServiceMethod.ModelTagsApply, { tagId: 3, key: detail })
    await expect(invoke(IpcChannel.RemoveModelTag, 3, detail)).resolves.toBe(false)
    await expect(invoke(IpcChannel.DeleteModelTag, 4)).resolves.toBe(true)
    await invoke(IpcChannel.ModelTagsOf, detail)
    expect(request).toHaveBeenCalledWith(ServiceMethod.ModelTagsOfModel, detail)
  })

  it('rejects a malformed model key or tag id', () => {
    const { invoke } = setup()
    expect(() => invoke(IpcChannel.ApplyModelTag, 3, { kind: 'refiner', identity: 'x' })).toThrow()
    expect(() => invoke(IpcChannel.ApplyModelTag, 3, { kind: 'lora', identity: '' })).toThrow()
    expect(() => invoke(IpcChannel.ApplyModelTag, 0, detail)).toThrow()
    expect(() => invoke(IpcChannel.ModelTagsOf, { ...detail, extra: 1 })).toThrow()
  })
})
