import { describe, expect, it } from 'vitest'
import { e2eUserDataOverride, userDataLocation } from './user-data-override'

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

describe('userDataLocation', () => {
  const e2e = { GENFOLIO_E2E: '1', GENFOLIO_USER_DATA: '/tmp/x' }

  it('gives unpackaged builds their own folder beside the installed app', () => {
    expect(userDataLocation({}, false, '/home/me/.config')).toBe('/home/me/.config/Genfolio-dev')
  })

  it('keeps the default for packaged builds', () => {
    expect(userDataLocation({}, true, '/home/me/.config')).toBeUndefined()
  })

  it('lets the e2e override win in both', () => {
    expect(userDataLocation(e2e, false, '/home/me/.config')).toBe('/tmp/x')
    expect(userDataLocation(e2e, true, '/home/me/.config')).toBe('/tmp/x')
  })
})
