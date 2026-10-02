import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerDownloadChannels } from './download-channels'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

type Handler = (...args: unknown[]) => unknown

function setup(): {
  invoke: (channel: IpcChannel, ...args: unknown[]) => unknown
  request: ReturnType<typeof vi.fn>
  downloads: Record<'start' | 'cancel' | 'list' | 'clearFinished', ReturnType<typeof vi.fn>>
  keys: Record<'status' | 'save' | 'clear', ReturnType<typeof vi.fn>>
} {
  const handlers = new Map<IpcChannel, { schema: z.ZodType; handler: Handler }>()
  const registry: IpcHandlerRegistry = {
    register: (channel, schema, handler) =>
      handlers.set(channel, { schema, handler: handler as Handler })
  }
  const request = vi.fn(async () => ({ items: [], nextCursor: null }))
  const downloads = {
    start: vi.fn(() => ({ id: 'd1' })),
    cancel: vi.fn(() => true),
    list: vi.fn(() => []),
    clearFinished: vi.fn()
  }
  const keys = {
    status: vi.fn(async () => ({ hasKey: true })),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined)
  }
  registerDownloadChannels(
    registry,
    { request } as unknown as ServiceRequester,
    downloads as never,
    keys as never
  )
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request, downloads, keys }
}

describe('registerDownloadChannels', () => {
  it('validates a browse query before forwarding it', async () => {
    const { invoke, request } = setup()
    await invoke(IpcChannel.BrowseCivitai, {
      kind: 'lora',
      text: ' detail ',
      baseModel: 'SDXL 1.0'
    })
    expect(request).toHaveBeenCalledWith(ServiceMethod.CivitaiBrowse, {
      kind: 'lora',
      text: 'detail',
      baseModel: 'SDXL 1.0'
    })
    expect(() => invoke(IpcChannel.BrowseCivitai, { kind: 'vae' })).toThrow()
    expect(() =>
      invoke(IpcChannel.BrowseCivitai, { kind: 'lora', text: 'x'.repeat(201) })
    ).toThrow()
    expect(() =>
      invoke(IpcChannel.BrowseCivitai, { kind: 'lora', cursor: 'x'.repeat(501) })
    ).toThrow()
    expect(() => invoke(IpcChannel.BrowseCivitai, { kind: 'lora', limit: 1000 })).toThrow()
  })

  it('starts a download from ids alone, refusing an address or a path', async () => {
    const { invoke, downloads } = setup()
    await invoke(IpcChannel.StartDownload, { kind: 'lora', modelId: 5, versionId: 9 })
    expect(downloads.start).toHaveBeenCalledWith({ kind: 'lora', modelId: 5, versionId: 9 })
    for (const extra of [{ url: 'https://evil.example/x' }, { path: '/etc/passwd' }]) {
      expect(() =>
        invoke(IpcChannel.StartDownload, { kind: 'lora', modelId: 5, versionId: 9, ...extra })
      ).toThrow()
    }
    expect(() =>
      invoke(IpcChannel.StartDownload, { kind: 'lora', modelId: 0, versionId: 9 })
    ).toThrow()
    expect(() =>
      invoke(IpcChannel.StartDownload, { kind: 'lora', modelId: 5.5, versionId: 9 })
    ).toThrow()
  })

  it('cancels, lists and clears', async () => {
    const { invoke, downloads } = setup()
    await expect(invoke(IpcChannel.CancelDownload, 'd1')).resolves.toBe(true)
    expect(downloads.cancel).toHaveBeenCalledWith('d1')
    expect(() => invoke(IpcChannel.CancelDownload, '')).toThrow()
    await expect(invoke(IpcChannel.ListDownloads)).resolves.toEqual([])
    await invoke(IpcChannel.ClearFinishedDownloads)
    expect(downloads.clearFinished).toHaveBeenCalled()
  })

  it('saves a valid API key and answers with the status, never the key', async () => {
    const { invoke, keys } = setup()
    const status = await invoke(IpcChannel.SetCivitaiKey, ' abcdef0123456789abcdef0123456789 ')
    expect(keys.save).toHaveBeenCalledWith('abcdef0123456789abcdef0123456789')
    expect(status).toEqual({ hasKey: true })
    expect(JSON.stringify(status)).not.toContain('abcdef')
  })

  it.each([
    '',
    'short',
    'has space in it 1234567890',
    'x'.repeat(129),
    'wéird-key-with-accents-123'
  ])('refuses the API key %j', (key) => {
    const { invoke, keys } = setup()
    expect(() => invoke(IpcChannel.SetCivitaiKey, key)).toThrow()
    expect(keys.save).not.toHaveBeenCalled()
  })

  it('clears the key and reads its status', async () => {
    const { invoke, keys } = setup()
    await invoke(IpcChannel.ClearCivitaiKey)
    expect(keys.clear).toHaveBeenCalled()
    await expect(invoke(IpcChannel.CivitaiKeyStatus)).resolves.toEqual({ hasKey: true })
  })
})
