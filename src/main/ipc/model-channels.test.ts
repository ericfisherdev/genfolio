import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerModelChannels } from './model-channels'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

type Handler = (...args: unknown[]) => unknown

function setup(reply: unknown = null): {
  invoke: (channel: IpcChannel, ...args: unknown[]) => unknown
  request: ReturnType<typeof vi.fn>
  clipboard: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<IpcChannel, { schema: z.ZodType; handler: Handler }>()
  const registry: IpcHandlerRegistry = {
    register: (channel, schema, handler) =>
      handlers.set(channel, { schema, handler: handler as Handler })
  }
  const request = vi.fn(async () => reply)
  const clipboard = vi.fn()
  registerModelChannels(registry, { request } as unknown as ServiceRequester, clipboard)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request, clipboard }
}

const key = { kind: 'lora', identity: 'detail' }
const fields = {
  baseModel: null,
  triggerWords: ['a'],
  strength: 0.8,
  description: null,
  notes: null
}

describe('registerModelChannels', () => {
  it('validates a list query before forwarding it', async () => {
    const { invoke, request } = setup()
    await invoke(IpcChannel.ListModels, { offset: 0, limit: 50, text: 'x' })
    expect(request).toHaveBeenCalledWith(ServiceMethod.ModelsList, {
      offset: 0,
      limit: 50,
      text: 'x'
    })
    expect(() => invoke(IpcChannel.ListModels, { offset: 0, limit: 201 })).toThrow()
    expect(() => invoke(IpcChannel.ListModels, { offset: -1, limit: 10 })).toThrow()
    expect(() => invoke(IpcChannel.ListModels, { offset: 0, limit: 10, kind: 'vae' })).toThrow()
  })

  it('saves, creates and clears with validated arguments', async () => {
    const { invoke, request } = setup({ cleared: true })
    await invoke(IpcChannel.SaveModel, key, fields)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.ModelsSave, { key, fields })
    await invoke(IpcChannel.CreateModel, 'lora', '  My LoRA ', fields)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.ModelsCreate, {
      kind: 'lora',
      name: 'My LoRA',
      fields
    })
    await expect(invoke(IpcChannel.ClearModel, key)).resolves.toBe(true)
    expect(() => invoke(IpcChannel.SaveModel, key, { ...fields, strength: 99 })).toThrow()
    expect(() => invoke(IpcChannel.SaveModel, key, { ...fields, extra: 1 })).toThrow()
    expect(() => invoke(IpcChannel.CreateModel, 'lora', '   ', fields)).toThrow()
  })

  it('copies the stored trigger words, comma-separated', async () => {
    const { invoke, clipboard } = setup({ triggerWords: ['add detail', 'sharp'] })
    await expect(invoke(IpcChannel.CopyModelTriggerWords, key)).resolves.toBe(true)
    expect(clipboard).toHaveBeenCalledWith('add detail, sharp')
  })

  it('copies nothing for a model without trigger words or unknown', async () => {
    const none = setup({ triggerWords: [] })
    await expect(none.invoke(IpcChannel.CopyModelTriggerWords, key)).resolves.toBe(false)
    const missing = setup(null)
    await expect(missing.invoke(IpcChannel.CopyModelTriggerWords, key)).resolves.toBe(false)
    expect(none.clipboard).not.toHaveBeenCalled()
    expect(missing.clipboard).not.toHaveBeenCalled()
  })
})
