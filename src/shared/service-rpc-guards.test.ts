import { describe, expect, it } from 'vitest'
import { ServiceMethod } from './service-contract'
import { isServiceEventMessage, isServiceRequest, isServiceResponse } from './service-rpc-guards'

describe('isServiceRequest', () => {
  it('accepts a known method with numeric id', () => {
    expect(isServiceRequest({ id: 1, method: ServiceMethod.Health, params: {} })).toBe(true)
  })

  it.each([
    null,
    'health',
    { id: '1', method: 'health' },
    { id: 1, method: 'drop-tables', params: {} },
    { id: 1, method: 'health' },
    { id: 1 }
  ])('rejects %j', (value) => {
    expect(isServiceRequest(value)).toBe(false)
  })
})

describe('isServiceResponse', () => {
  it('accepts success and failure shapes', () => {
    expect(isServiceResponse({ id: 1, ok: true, result: {} })).toBe(true)
    expect(isServiceResponse({ id: 1, ok: false, error: 'boom' })).toBe(true)
  })

  it.each([{ id: 1, ok: true }, { id: 1, ok: false }, { ok: true, result: 1 }, undefined])(
    'rejects %j',
    (value) => {
      expect(isServiceResponse(value)).toBe(false)
    }
  )
})

describe('isServiceEventMessage', () => {
  it('accepts an event envelope without an id', () => {
    expect(isServiceEventMessage({ event: { type: 'finished' } })).toBe(true)
  })

  it.each([{ id: 1, event: {} }, { result: 1 }, null])('rejects %j', (value) => {
    expect(isServiceEventMessage(value)).toBe(false)
  })
})
