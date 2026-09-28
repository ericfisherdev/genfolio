import type Database from 'better-sqlite3'
import type { SlideshowPresetRepository } from '@domain/repositories'
import { nameKey } from '@shared/name-key'
import type { SlideshowPreset, SlideshowSettings } from '@shared/slideshow'

interface PresetRow {
  id: number
  name: string
  interval_ms: number
  shuffle: number
  loop: number
  show_prompt: number
}

const presetOf = (row: PresetRow): SlideshowPreset => ({
  id: row.id,
  name: row.name,
  settings: {
    intervalMs: row.interval_ms,
    shuffle: row.shuffle === 1,
    loop: row.loop === 1,
    showPrompt: row.show_prompt === 1
  }
})

const flag = (value: boolean): number => (value ? 1 : 0)

export class SqliteSlideshowPresetRepository implements SlideshowPresetRepository {
  private readonly selectAll: Database.Statement<[], PresetRow>
  private readonly upsert: Database.Statement<
    [string, string, number, number, number, number],
    PresetRow
  >
  private readonly deletePreset: Database.Statement<[number]>

  constructor(db: Database.Database) {
    this.selectAll = db.prepare('SELECT * FROM slideshow_presets ORDER BY name_key, id')
    // A taken name keeps its row and takes the new spelling and settings.
    this.upsert = db.prepare(`
      INSERT INTO slideshow_presets (name, name_key, interval_ms, shuffle, loop, show_prompt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (name_key) DO UPDATE SET
        name = excluded.name, interval_ms = excluded.interval_ms, shuffle = excluded.shuffle,
        loop = excluded.loop, show_prompt = excluded.show_prompt
      RETURNING *`)
    this.deletePreset = db.prepare('DELETE FROM slideshow_presets WHERE id = ?')
  }

  list(): SlideshowPreset[] {
    return this.selectAll.all().map(presetOf)
  }

  save(name: string, settings: SlideshowSettings): SlideshowPreset {
    const row = this.upsert.get(
      name,
      nameKey(name),
      settings.intervalMs,
      flag(settings.shuffle),
      flag(settings.loop),
      flag(settings.showPrompt)
    )
    if (!row) throw new Error('preset upsert returned no row')
    return presetOf(row)
  }

  delete(id: number): boolean {
    return this.deletePreset.run(id).changes > 0
  }
}
