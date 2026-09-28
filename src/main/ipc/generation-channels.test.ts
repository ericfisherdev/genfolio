import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { CopyVariant } from '@shared/generation'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerGenerationChannels } from './generation-channels'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

type Handler = (...args: unknown[]) => unknown

function setup(text: string | null): {
  invoke: (channel: IpcChannel, ...args: unknown[]) => unknown
  request: ReturnType<typeof vi.fn>
  writeClipboard: ReturnType<typeof vi.fn>
} {
  const handlers = new Map<IpcChannel, { schema: z.ZodType; handler: Handler }>()
  const registry: IpcHandlerRegistry = {
    register: (channel, schema, handler) =>
      handlers.set(channel, { schema, handler: handler as Handler })
  }
  const request = vi.fn(async () => text)
  const writeClipboard = vi.fn()
  registerGenerationChannels(registry, { request } as unknown as ServiceRequester, writeClipboard)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { invoke, request, writeClipboard }
}

describe('registerGenerationChannels', () => {
  it('writes the service text to the clipboard in main', async () => {
    const { invoke, request, writeClipboard } = setup('a prompt')
    await expect(invoke(IpcChannel.CopyGeneration, 7, CopyVariant.Prompt)).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith(ServiceMethod.ImageGenerationText, {
      imageId: 7,
      variant: CopyVariant.Prompt
    })
    expect(writeClipboard).toHaveBeenCalledWith('a prompt')
  })

  it('leaves the clipboard alone when there is no text', async () => {
    const { invoke, writeClipboard } = setup(null)
    await expect(invoke(IpcChannel.CopyGeneration, 7, CopyVariant.All)).resolves.toBe(false)
    expect(writeClipboard).not.toHaveBeenCalled()
  })

  it('rejects an unknown variant or a bad id before asking the service', () => {
    const { invoke, request } = setup('x')
    expect(() => invoke(IpcChannel.CopyGeneration, 7, 'everything')).toThrow()
    expect(() => invoke(IpcChannel.GetGeneration, -1)).toThrow()
    expect(request).not.toHaveBeenCalled()
  })
})
