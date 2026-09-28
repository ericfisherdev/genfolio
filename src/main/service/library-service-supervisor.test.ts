import { describe, expect, it, vi } from 'vitest'
import { ServiceMethod } from '@shared/service-rpc'
import type { ServiceRequester } from './library-service-client'
import {
  LibraryServiceSupervisor,
  type RestartPolicy,
  type SupervisorLogger
} from './library-service-supervisor'

interface FakeClient extends ServiceRequester {
  readonly name: string
  crash(code: number): void
}

interface Harness {
  readonly supervisor: LibraryServiceSupervisor
  readonly clients: FakeClient[]
  readonly logger: SupervisorLogger
  advance(ms: number): void
  latest(): FakeClient
}

function harness(policy: RestartPolicy = { maxRestarts: 2, windowMs: 1_000 }): Harness {
  let time = 0
  const clients: FakeClient[] = []
  const logger: SupervisorLogger = { warn: vi.fn(), error: vi.fn() }
  const supervisor = new LibraryServiceSupervisor(
    (onExit) => {
      const name = `client-${clients.length + 1}`
      const client: FakeClient = {
        name,
        request: async () => name as never,
        crash: (code) => onExit(code)
      }
      clients.push(client)
      return client
    },
    policy,
    logger,
    () => time
  )
  return {
    supervisor,
    clients,
    logger,
    advance: (ms: number) => {
      time += ms
    },
    latest: () => clients[clients.length - 1] as FakeClient
  }
}

describe('LibraryServiceSupervisor', () => {
  it('starts one client and forwards requests to it', async () => {
    const { supervisor, clients } = harness()
    expect(clients).toHaveLength(1)
    await expect(supervisor.request(ServiceMethod.Health)).resolves.toBe('client-1')
  })

  it('replaces the client after a crash', async () => {
    const { supervisor, clients, latest } = harness()
    latest().crash(139)
    expect(clients).toHaveLength(2)
    await expect(supervisor.request(ServiceMethod.Health)).resolves.toBe('client-2')
  })

  it('stops restarting after too many crashes within the window', () => {
    const { clients, logger, latest } = harness({ maxRestarts: 2, windowMs: 1_000 })
    latest().crash(139)
    latest().crash(139)
    latest().crash(139)
    expect(clients).toHaveLength(3)
    expect(logger.error).toHaveBeenCalledOnce()
  })

  it('forgets crashes older than the window', () => {
    const { clients, advance, latest } = harness({ maxRestarts: 1, windowMs: 1_000 })
    latest().crash(139)
    advance(1_001)
    latest().crash(139)
    expect(clients).toHaveLength(3)
  })
})
