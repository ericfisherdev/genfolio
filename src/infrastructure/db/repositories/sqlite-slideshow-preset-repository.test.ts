import { describe, expect, it } from 'vitest'
import { migratedMemoryDb } from '../testing/migrated-memory-db'
import { SqliteSlideshowPresetRepository } from './sqlite-slideshow-preset-repository'

const SLOW = { intervalMs: 10_000, shuffle: true, loop: false, showPrompt: true }

describe('SqliteSlideshowPresetRepository', () => {
  it('saves, lists by name, updates a taken name and deletes', () => {
    const presets = new SqliteSlideshowPresetRepository(migratedMemoryDb())
    const slow = presets.save('Slow', SLOW)
    presets.save('Fast', { ...SLOW, intervalMs: 2_000 })
    expect(presets.list().map((preset) => preset.name)).toEqual(['Fast', 'Slow'])
    const updated = presets.save(' slow '.trim(), { ...SLOW, loop: true })
    expect(updated).toEqual({ id: slow.id, name: 'slow', settings: { ...SLOW, loop: true } })
    expect(presets.list()).toHaveLength(2)
    expect(presets.delete(slow.id)).toBe(true)
    expect(presets.delete(slow.id)).toBe(false)
  })

  it('refuses an interval outside 2–60 s', () => {
    const presets = new SqliteSlideshowPresetRepository(migratedMemoryDb())
    expect(() => presets.save('Too fast', { ...SLOW, intervalMs: 500 })).toThrow(/CHECK/)
  })
})
