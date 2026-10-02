import type { Migration } from './migration'

export const modelCivitaiMigration: Migration = {
  version: 9,
  name: 'what Civitai says about a model',
  // Kept apart from model_info so a refresh from Civitai never touches what the user wrote.
  // Keyed by (kind, identity) like model_info, for the same reason.
  sql: `
    CREATE TABLE model_civitai (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('checkpoint', 'lora')),
      identity TEXT NOT NULL CHECK (length(identity) > 0),
      civitai_model_id INTEGER NOT NULL,
      civitai_version_id INTEGER NOT NULL,
      model_name TEXT NOT NULL,
      version_name TEXT NOT NULL,
      base_model TEXT,
      trigger_words_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(trigger_words_json) AND json_type(trigger_words_json) = 'array'),
      description TEXT,
      version_description TEXT,
      creator TEXT,
      nsfw INTEGER NOT NULL DEFAULT 0 CHECK (nsfw IN (0, 1)),
      tags_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array'),
      downloads INTEGER,
      thumbs_up INTEGER,
      published_at TEXT,
      fetched_at INTEGER NOT NULL,
      UNIQUE (kind, identity)
    ) STRICT;
  `
}
