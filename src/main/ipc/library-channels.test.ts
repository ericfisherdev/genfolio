import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { AddRootOutcome } from '@shared/library'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerLibraryChannels, type FolderPicker } from './library-channels'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

type Handler = (...args: unknown[]) => unknown

interface Harness {
  readonly handlers: Map<IpcChannel, { schema: z.ZodType; handler: Handler }>
  readonly request: ReturnType<typeof vi.fn>
  invoke(channel: IpcChannel, ...args: unknown[]): unknown
}

function setup(
  pickFolder: FolderPicker,
  results: Partial<Record<ServiceMethod, unknown>> = {}
): Harness {
  const handlers = new Map<IpcChannel, { schema: z.ZodType; handler: Handler }>()
  const registry: IpcHandlerRegistry = {
    register: (channel, schema, handler) =>
      handlers.set(channel, { schema, handler: handler as Handler })
  }
  const request = vi.fn(async (method: ServiceMethod) => results[method])
  registerLibraryChannels(registry, { request } as unknown as ServiceRequester, pickFolder)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { handlers, request, invoke }
}

describe('registerLibraryChannels', () => {
  it('registers every library channel', () => {
    expect([...setup(async () => undefined).handlers.keys()].sort()).toEqual(
      Object.values(IpcChannel).sort()
    )
  })

  it('returns cancelled without calling the service when the picker is dismissed', async () => {
    const { request, invoke } = setup(async () => undefined)
    await expect(invoke(IpcChannel.AddRootViaDialog)).resolves.toEqual({
      outcome: AddRootOutcome.Cancelled
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('adds the picked folder through the service', async () => {
    const added = { outcome: AddRootOutcome.AlreadyAdded, path: '/lib' }
    const { request, invoke } = setup(async () => '/lib', { [ServiceMethod.AddRoot]: added })
    await expect(invoke(IpcChannel.AddRootViaDialog)).resolves.toBe(added)
    expect(request).toHaveBeenCalledWith(ServiceMethod.AddRoot, { path: '/lib' })
  })

  it('unwraps remove and rescan results', async () => {
    const { invoke } = setup(async () => undefined, {
      [ServiceMethod.RemoveRoot]: { removed: true },
      [ServiceMethod.RescanRoot]: { started: false }
    })
    await expect(invoke(IpcChannel.RemoveRoot, 3)).resolves.toBe(true)
    await expect(invoke(IpcChannel.RescanRoot, 3)).resolves.toBe(false)
  })

  it('rejects a non-positive root id at the schema', () => {
    const { invoke } = setup(async () => undefined)
    expect(() => invoke(IpcChannel.RemoveRoot, 0)).toThrow()
  })
})
