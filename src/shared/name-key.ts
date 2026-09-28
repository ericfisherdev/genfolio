/**
 * The key user-given names (tags, albums, presets) are unique on: Unicode-normalized, trimmed
 * and lower-cased, so `Élan`, `élan ` and `ÉLAN` are the same name. SQLite's NOCASE folds
 * ASCII only.
 */
export function nameKey(name: string): string {
  return name.normalize('NFC').trim().toLowerCase()
}
