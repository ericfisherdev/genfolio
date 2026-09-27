import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { ServiceMethod, type ServiceRequest } from '@shared/service-rpc'
import {
  LibraryServiceClient,
  ServiceExitedError,
  ServiceRequestError,
  type ServiceProcess
} from './library-service-client'

class FakeServiceProcess extends EventEmitter {
  readonly sent: ServiceRequest[] = []
  postMessage(message: ServiceRequest): void {
    this.sent.push(message)
  }
}

function setup(): { child: FakeServiceProcess; client: LibraryServiceClient } {
  const child = new FakeServiceProcess()
  return { child, client: new LibraryServiceClient(child as unknown as ServiceProcess) }
}

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

  it('rejects outstanding and future requests after the process exits', async () => {
    const { child, client } = setup()
    const pending = client.request(ServiceMethod.Health)
    child.emit('exit', 139)
    await expect(pending).rejects.toBeInstanceOf(ServiceExitedError)
    await expect(client.request(ServiceMethod.Health)).rejects.toMatchObject({ exitCode: 139 })
  })
})
