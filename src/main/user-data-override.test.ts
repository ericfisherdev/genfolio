import { describe, expect, it } from 'vitest'
import { e2eUserDataOverride } from './user-data-override'

describe('e2eUserDataOverride', () => {
  it('returns the override in e2e mode', () => {
    expect(e2eUserDataOverride({ GENFOLIO_E2E: '1', GENFOLIO_USER_DATA: '/tmp/x' })).toBe('/tmp/x')
  })

  it.each([
    { GENFOLIO_USER_DATA: '/tmp/x' },
    { GENFOLIO_E2E: '1' },
    { GENFOLIO_E2E: '1', GENFOLIO_USER_DATA: '' }
  ])('ignores %j', (env) => {
    expect(e2eUserDataOverride(env)).toBeUndefined()
  })
})
