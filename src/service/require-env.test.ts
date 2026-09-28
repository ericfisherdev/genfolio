import { describe, expect, it } from 'vitest'
import { requireEnv } from './require-env'

describe('requireEnv', () => {
  it('returns a set value', () => {
    expect(requireEnv('X', { X: '/tmp/db' })).toBe('/tmp/db')
  })

  it.each([{}, { X: '' }])('throws for %j', (env) => {
    expect(() => requireEnv('X', env)).toThrow(/X is required/)
  })
})
