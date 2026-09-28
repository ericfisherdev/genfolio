import { describe, expect, it } from 'vitest'
import { ServiceMethod } from './service-rpc'
import { isServiceRequest, isServiceResponse } from './service-rpc-guards'

describe('isServiceRequest', () => {
  it('accepts a known method with numeric id', () => {
    expect(isServiceRequest({ id: 1, method: ServiceMethod.Health })).toBe(true)
  })

  it.each([
    null,
    'health',
    { id: '1', method: 'health' },
    { id: 1, method: 'drop-tables' },
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
