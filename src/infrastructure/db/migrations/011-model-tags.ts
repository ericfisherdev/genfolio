import type { Migration } from './migration'

export const modelTagsMigration: Migration = {
  version: 11,
  name: 'model tags, a vocabulary separate from image tags',
  // Names are unique on name_key, folded by the repository with nameKey() as image tags are.
  // Links are keyed by (kind, identity) like model_info, not by models.id: model rows are
  // pruned once no image uses them and their ids recycled, but a tag the user put on a model
  // must outlive that. A link may therefore name a model with no models row.
  sql: `
    CREATE TABLE model_tags (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      -- Checked on the key, trimmed as the app trims (SQLite's trim() strips only spaces).
      name_key TEXT NOT NULL UNIQUE CHECK (length(name_key) > 0),
      created_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE model_tag_links (
      tag_id INTEGER NOT NULL REFERENCES model_tags(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('checkpoint', 'lora')),
      identity TEXT NOT NULL CHECK (length(identity) > 0),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (tag_id, kind, identity)
    ) STRICT, WITHOUT ROWID;
    -- A model's tags, and the models carrying a tag, found by the model's key.
    CREATE INDEX model_tag_links_model ON model_tag_links(kind, identity, tag_id);
  `
}
