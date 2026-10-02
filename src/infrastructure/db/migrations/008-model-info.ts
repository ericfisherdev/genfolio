import type { Migration } from './migration'

export const modelInfoMigration: Migration = {
  version: 8,
  name: 'what the user records about a model',
  // Keyed by (kind, identity) rather than models.id: model rows are pruned once no image uses
  // them and their ids recycled, but what the user wrote about a model must outlive that. A
  // row without a models row is a model added by hand.
  sql: `
    CREATE TABLE model_info (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('checkpoint', 'lora')),
      identity TEXT NOT NULL CHECK (length(identity) > 0),
      display_name TEXT NOT NULL CHECK (length(display_name) > 0),
      base_model TEXT,
      trigger_words_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(trigger_words_json) AND json_type(trigger_words_json) = 'array'),
      strength REAL,
      description TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (kind, identity)
    ) STRICT;
  `
}
