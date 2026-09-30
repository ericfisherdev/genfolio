import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { registerAppChannels, type AppActions } from './app-channels'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

type Handler = (...args: unknown[]) => unknown

describe('registerAppChannels', () => {
  it('opens logs, records renderer errors by a bounded name and reports diagnostics', async () => {
    const handlers = new Map<IpcChannel, { schema: z.ZodType; handler: Handler }>()
    const registry: IpcHandlerRegistry = {
      register: (channel, schema, handler) =>
        handlers.set(channel, { schema, handler: handler as Handler })
    }
    const actions: AppActions = {
      openLogs: vi.fn(async () => true),
      logRendererError: vi.fn(),
      diagnostics: () => ({ serviceRestarts: 1, serviceStopped: false }),
      cancelUpdateDownload: vi.fn()
    }
    registerAppChannels(registry, actions)
    const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
      const entry = handlers.get(channel)
      if (!entry) throw new Error(`${channel} not registered`)
      return entry.handler(...(entry.schema.parse(args) as unknown[]))
    }
    await expect(invoke(IpcChannel.OpenLogs)).resolves.toBe(true)
    await invoke(IpcChannel.ReportRendererError, 'TypeError')
    expect(actions.logRendererError).toHaveBeenCalledWith('TypeError')
    expect(() => invoke(IpcChannel.ReportRendererError, 'x'.repeat(101))).toThrow()
    await expect(invoke(IpcChannel.Diagnostics)).resolves.toEqual({
      serviceRestarts: 1,
      serviceStopped: false
    })
    await invoke(IpcChannel.CancelUpdateDownload)
    expect(actions.cancelUpdateDownload).toHaveBeenCalledOnce()
  })
})
