import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerAlbumChannels } from './album-channels'
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
  registerAlbumChannels(registry, { request } as unknown as ServiceRequester)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request }
}

describe('registerAlbumChannels', () => {
  it('trims names and rejects blank, long or control-character names', async () => {
    const { invoke, request } = setup()
    await invoke(IpcChannel.CreateAlbum, '  Trip  ')
    expect(request).toHaveBeenCalledWith(ServiceMethod.AlbumsCreate, { name: 'Trip' })
    expect(() => invoke(IpcChannel.CreateAlbum, '   ')).toThrow()
    expect(() => invoke(IpcChannel.CreateAlbum, 'x'.repeat(101))).toThrow()
    expect(() => invoke(IpcChannel.RenameAlbum, 1, 'bad\u0007name')).toThrow()
  })

  it('forwards membership and order commands and returns the count', async () => {
    const { invoke, request } = setup()
    await expect(invoke(IpcChannel.AddToAlbum, 1, [2, 3])).resolves.toBe(3)
    expect(request).toHaveBeenCalledWith(ServiceMethod.AlbumsAdd, { albumId: 1, imageIds: [2, 3] })
    await expect(invoke(IpcChannel.MoveInAlbum, 1, [3], null)).resolves.toBe(3)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.AlbumsMove, {
      albumId: 1,
      imageIds: [3],
      beforeId: null
    })
    expect(() => invoke(IpcChannel.AddToAlbum, 1, [])).toThrow()
    expect(() => invoke(IpcChannel.MoveInAlbum, 1, [2], 0)).toThrow()
    await expect(invoke(IpcChannel.DeleteAlbum, 4)).resolves.toBe(true)
    await invoke(IpcChannel.SetAlbumCover, 1, null)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.AlbumsSetCover, { id: 1, imageId: null })
  })
})
