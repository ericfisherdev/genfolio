import { describe, expect, it } from 'vitest'
import { migratedMemoryDb } from '../testing/migrated-memory-db'
import { SqliteAppSettingsRepository } from './sqlite-app-settings-repository'

describe('SqliteAppSettingsRepository', () => {
  it('stores, replaces and removes a value', () => {
    const settings = new SqliteAppSettingsRepository(migratedMemoryDb())
    expect(settings.get('a')).toBeUndefined()
    settings.set('a', '1')
    settings.set('a', '2')
    expect(settings.get('a')).toBe('2')
    settings.remove('a')
    settings.remove('a')
    expect(settings.get('a')).toBeUndefined()
  })
})
