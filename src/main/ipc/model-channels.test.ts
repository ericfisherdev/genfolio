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
  openExternal: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<IpcChannel, { schema: z.ZodType; handler: Handler }>()
  const registry: IpcHandlerRegistry = {
    register: (channel, schema, handler) =>
      handlers.set(channel, { schema, handler: handler as Handler })
  }
  const request = vi.fn(async () => reply)
  const clipboard = vi.fn()
  const openExternal = vi.fn()
  registerModelChannels(
    registry,
    { request } as unknown as ServiceRequester,
    clipboard,
    openExternal
  )
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request, clipboard, openExternal }
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

  it('validates and forwards the Civitai calls', async () => {
    const { invoke, request } = setup({ unlinked: true })
    await invoke(IpcChannel.LookupModelOnCivitai, key)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.ModelsCivitaiLookup, key)
    await invoke(IpcChannel.SearchCivitai, {
      kind: 'lora',
      text: ' add detail ',
      identity: 'detail'
    })
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.ModelsCivitaiSearch, {
      kind: 'lora',
      text: 'add detail',
      identity: 'detail'
    })
    await invoke(IpcChannel.LinkModelToCivitai, key, 5, 9)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.ModelsCivitaiLink, {
      key,
      modelId: 5,
      versionId: 9
    })
    await invoke(IpcChannel.RefreshModelFromCivitai, key)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.ModelsCivitaiRefresh, key)
    await expect(invoke(IpcChannel.UnlinkModelFromCivitai, key)).resolves.toBe(true)
    expect(() => invoke(IpcChannel.SearchCivitai, { kind: 'lora', text: '   ' })).toThrow()
    expect(() =>
      invoke(IpcChannel.SearchCivitai, { kind: 'lora', text: 'x'.repeat(201) })
    ).toThrow()
    expect(() => invoke(IpcChannel.LinkModelToCivitai, key, 0, 9)).toThrow()
    expect(() => invoke(IpcChannel.LinkModelToCivitai, key, 5, 1.5)).toThrow()
  })

  it('opens the linked Civitai page from the stored ids, never from the renderer', async () => {
    const { invoke, openExternal } = setup({ civitai: { modelId: 122359, versionId: 135867 } })
    await expect(invoke(IpcChannel.OpenModelOnCivitai, key)).resolves.toBe(true)
    expect(openExternal).toHaveBeenCalledWith(
      'https://civitai.com/models/122359?modelVersionId=135867'
    )
    expect(() => invoke(IpcChannel.OpenModelOnCivitai, key, 'https://evil.example')).toThrow()
  })

  it('opens nothing for a model that is not linked or unknown', async () => {
    const unlinked = setup({ civitai: null })
    await expect(unlinked.invoke(IpcChannel.OpenModelOnCivitai, key)).resolves.toBe(false)
    const unknown = setup(null)
    await expect(unknown.invoke(IpcChannel.OpenModelOnCivitai, key)).resolves.toBe(false)
    expect(unlinked.openExternal).not.toHaveBeenCalled()
    expect(unknown.openExternal).not.toHaveBeenCalled()
  })
})
