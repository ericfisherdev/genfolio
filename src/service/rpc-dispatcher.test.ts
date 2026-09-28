import { describe, expect, it } from 'vitest'
import type { ServiceHealth } from '@shared/service-health'
import { ServiceMethod } from '@shared/service-contract'
import { RpcDispatcher, type ServiceHandlers } from './rpc-dispatcher'
import { startupFailureHandlers } from './startup-failure-handlers'

const health: ServiceHealth = {
  electron: '44.4.5',
  node: '24.21.0',
  sqlite: '3.53.4',
  fts5: true,
  schemaVersion: 1,
  decodableFormats: ['png']
}

function handlers(overrides: Partial<ServiceHandlers>): ServiceHandlers {
  return { ...startupFailureHandlers('not under test'), ...overrides }
}

describe('RpcDispatcher', () => {
  it('wraps handler results with the request id', async () => {
    const dispatcher = new RpcDispatcher(handlers({ [ServiceMethod.Health]: async () => health }))
    await expect(
      dispatcher.dispatch({ id: 7, method: ServiceMethod.Health, params: {} })
    ).resolves.toEqual({ id: 7, ok: true, result: health })
  })

  it('passes validated params to the handler', async () => {
    const dispatcher = new RpcDispatcher(
      handlers({ [ServiceMethod.RescanRoot]: async ({ rootId }) => ({ started: rootId === 3 }) })
    )
    await expect(
      dispatcher.dispatch({ id: 1, method: ServiceMethod.RescanRoot, params: { rootId: 3 } })
    ).resolves.toMatchObject({ ok: true, result: { started: true } })
  })

  it.each([{}, { rootId: 'three' }, { rootId: 3, extra: true }])(
    'rejects invalid params %j without calling the handler',
    async (params) => {
      let called = false
      const dispatcher = new RpcDispatcher(
        handlers({
          [ServiceMethod.RescanRoot]: async () => {
            called = true
            return { started: true }
          }
        })
      )
      const response = await dispatcher.dispatch({
        id: 2,
        method: ServiceMethod.RescanRoot,
        params
      })
      expect(response).toMatchObject({ ok: false, error: expect.stringMatching(/^invalid params/) })
      expect(called).toBe(false)
    }
  )

  it('turns handler failures into error responses', async () => {
    const dispatcher = new RpcDispatcher(startupFailureHandlers('database is newer'))
    await expect(
      dispatcher.dispatch({ id: 8, method: ServiceMethod.ListRoots, params: {} })
    ).resolves.toEqual({ id: 8, ok: false, error: 'database is newer' })
  })
})
