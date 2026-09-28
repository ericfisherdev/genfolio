import { describe, expect, it } from 'vitest'
import { nameKey } from './name-key'

describe('nameKey', () => {
  it('folds case beyond ASCII, trims and normalizes', () => {
    expect(nameKey(' Élan ')).toBe(nameKey('élan'))
    expect(nameKey('Élan')).toBe(nameKey('Élan'))
    expect(nameKey('ÄRGER')).toBe('ärger')
    expect(nameKey('red')).not.toBe(nameKey('reds'))
  })
})
