import { describe, expect, it } from 'vitest'
import { ServiceMethod } from '@shared/service-rpc'
import type { ServiceHealth } from '@shared/service-health'
import { RpcDispatcher } from './rpc-dispatcher'

const health: ServiceHealth = {
  electron: '44.4.5',
  node: '24.21.0',
  sqlite: '3.53.4',
  fts5: true,
  decodableFormats: ['png']
}

describe('RpcDispatcher', () => {
  it('wraps handler results with the request id', async () => {
    const dispatcher = new RpcDispatcher({ [ServiceMethod.Health]: async () => health })
    await expect(dispatcher.dispatch({ id: 7, method: ServiceMethod.Health })).resolves.toEqual({
      id: 7,
      ok: true,
      result: health
    })
  })

  it('turns handler failures into error responses', async () => {
    const dispatcher = new RpcDispatcher({
      [ServiceMethod.Health]: async () => {
        throw new Error('sqlite missing')
      }
    })
    await expect(dispatcher.dispatch({ id: 8, method: ServiceMethod.Health })).resolves.toEqual({
      id: 8,
      ok: false,
      error: 'sqlite missing'
    })
  })
})
