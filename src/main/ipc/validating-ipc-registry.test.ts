import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import {
  InvalidRequestError,
  UntrustedSenderError,
  ValidatingIpcRegistry,
  type IpcRegistrar
} from './validating-ipc-registry'

type InvokeListener = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>

const APP_URL = 'file:///opt/genfolio/out/renderer/index.html'

function setup(): { invoke: (senderUrl: string | null, ...args: unknown[]) => Promise<unknown> } {
  let listener: InvokeListener | undefined
  const ipc: IpcRegistrar = {
    handle: (_channel, registered) => {
      listener = registered as InvokeListener
    }
  }
  const handler = vi.fn((count: number) => `got ${count}`)
  new ValidatingIpcRegistry(ipc, (url) => url === APP_URL).register(
    IpcChannel.ServiceHealth,
    z.tuple([z.number().int()]),
    handler
  )
  return {
    invoke: (senderUrl, ...args) => {
      const event = { senderFrame: senderUrl === null ? null : { url: senderUrl } }
      if (!listener) throw new Error('handler was not registered')
      return listener(event as unknown as IpcMainInvokeEvent, ...args)
    }
  }
}

describe('ValidatingIpcRegistry', () => {
  it('runs the handler for a trusted sender with valid arguments', async () => {
    await expect(setup().invoke(APP_URL, 3)).resolves.toBe('got 3')
  })

  it('rejects arguments that fail the schema', async () => {
    await expect(setup().invoke(APP_URL, 'three')).rejects.toBeInstanceOf(InvalidRequestError)
  })

  it('rejects extra arguments', async () => {
    await expect(setup().invoke(APP_URL, 3, 4)).rejects.toBeInstanceOf(InvalidRequestError)
  })

  it.each(['https://attacker.example/', null])('rejects sender %s', async (url) => {
    await expect(setup().invoke(url, 3)).rejects.toBeInstanceOf(UntrustedSenderError)
  })
})
