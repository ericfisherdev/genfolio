import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerSettingsChannels } from './settings-channels'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

type Handler = (...args: unknown[]) => unknown

function setup(picked: string | undefined): {
  invoke: (channel: IpcChannel, ...args: unknown[]) => unknown
  request: ReturnType<typeof vi.fn>
  pickFolder: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<IpcChannel, { schema: z.ZodType; handler: Handler }>()
  const registry: IpcHandlerRegistry = {
    register: (channel, schema, handler) =>
      handlers.set(channel, { schema, handler: handler as Handler })
  }
  const request = vi.fn(async () => ({ checkpoint: null, lora: null }))
  const pickFolder = vi.fn(async () => picked)
  registerSettingsChannels(registry, { request } as unknown as ServiceRequester, pickFolder)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request, pickFolder }
}

describe('registerSettingsChannels', () => {
  it('stores the folder the user picks for the kind', async () => {
    const { invoke, request, pickFolder } = setup('/models/loras')
    await invoke(IpcChannel.ChooseModelFolder, 'lora')
    expect(pickFolder).toHaveBeenCalledWith(expect.stringContaining('LoRAs'))
    expect(request).toHaveBeenCalledWith(ServiceMethod.SetModelFolder, {
      kind: 'lora',
      path: '/models/loras'
    })
  })

  it('leaves the folders alone when the picker is cancelled', async () => {
    const { invoke, request } = setup(undefined)
    await invoke(IpcChannel.ChooseModelFolder, 'checkpoint')
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(ServiceMethod.ModelFolders, {})
  })

  it('clears a folder and refuses an unknown kind', async () => {
    const { invoke, request } = setup('/x')
    await invoke(IpcChannel.ClearModelFolder, 'checkpoint')
    expect(request).toHaveBeenCalledWith(ServiceMethod.SetModelFolder, {
      kind: 'checkpoint',
      path: null
    })
    expect(() => invoke(IpcChannel.ClearModelFolder, 'vae')).toThrow()
    expect(() => invoke(IpcChannel.ChooseModelFolder)).toThrow()
  })
})
