import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServiceMethod, type ServiceRequest } from '@shared/service-rpc'
import {
  LibraryServiceClient,
  ServiceExitedError,
  ServiceRequestError,
  ServiceTimeoutError,
  type LibraryServiceClientOptions,
  type ServiceProcess
} from './library-service-client'

class FakeServiceProcess extends EventEmitter {
  readonly sent: ServiceRequest[] = []
  postMessage(message: ServiceRequest): void {
    this.sent.push(message)
  }
}

function setup(options: Partial<LibraryServiceClientOptions> = {}): {
  child: FakeServiceProcess
  client: LibraryServiceClient
} {
  const child = new FakeServiceProcess()
  const client = new LibraryServiceClient(child as unknown as ServiceProcess, {
    requestTimeoutMs: 1_000,
    ...options
  })
  return { child, client }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('LibraryServiceClient', () => {
  it('resolves with the result matching the request id', async () => {
    const { child, client } = setup()
    const pending = client.request(ServiceMethod.Health)
    const [request] = child.sent
    child.emit('message', { id: request?.id, ok: true, result: { sqlite: '3' } })
    await expect(pending).resolves.toEqual({ sqlite: '3' })
  })

  it('rejects with ServiceRequestError on an error response', async () => {
    const { child, client } = setup()
    const pending = client.request(ServiceMethod.Health)
    child.emit('message', { id: child.sent[0]?.id, ok: false, error: 'boom' })
    await expect(pending).rejects.toBeInstanceOf(ServiceRequestError)
  })

  it('ignores malformed and unknown messages', async () => {
    const { child, client } = setup()
    const pending = client.request(ServiceMethod.Health)
    child.emit('message', 'garbage')
    child.emit('message', { id: 999, ok: true, result: 1 })
    child.emit('message', { id: child.sent[0]?.id, ok: true, result: 2 })
    await expect(pending).resolves.toBe(2)
  })

  it('rejects with ServiceTimeoutError when the service never answers', async () => {
    vi.useFakeTimers()
    const { client } = setup({ requestTimeoutMs: 500 })
    const pending = client.request(ServiceMethod.Health)
    const assertion = expect(pending).rejects.toBeInstanceOf(ServiceTimeoutError)
    await vi.advanceTimersByTimeAsync(501)
    await assertion
  })

  it('ignores a late answer after the deadline passed', async () => {
    vi.useFakeTimers()
    const { child, client } = setup({ requestTimeoutMs: 500 })
    const pending = client.request(ServiceMethod.Health).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(501)
    child.emit('message', { id: child.sent[0]?.id, ok: true, result: 'late' })
    expect(await pending).toBeInstanceOf(ServiceTimeoutError)
  })

  it('rejects outstanding and future requests after the process exits', async () => {
    const { child, client } = setup()
    const pending = client.request(ServiceMethod.Health)
    child.emit('exit', 139)
    await expect(pending).rejects.toBeInstanceOf(ServiceExitedError)
    await expect(client.request(ServiceMethod.Health)).rejects.toMatchObject({ exitCode: 139 })
  })

  it('calls onExit once the client has latched the exit and rejected outstanding requests', async () => {
    let requestFromOnExit: Promise<unknown> | undefined
    const onExit = vi.fn(() => {
      requestFromOnExit = client.request(ServiceMethod.Health)
    })
    const { child, client } = setup({ onExit })
    const pending = client.request(ServiceMethod.Health)
    child.emit('exit', 139)
    expect(onExit).toHaveBeenCalledExactlyOnceWith(139)
    await expect(pending).rejects.toBeInstanceOf(ServiceExitedError)
    await expect(requestFromOnExit).rejects.toBeInstanceOf(ServiceExitedError)
    expect(child.sent).toHaveLength(1)
  })
})
