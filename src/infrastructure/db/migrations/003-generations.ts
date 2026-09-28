import type { Migration } from './migration'

export const generationsMigration: Migration = {
  version: 3,
  name: 'generations, models, raw metadata and Fooocus logs',
  sql: `
    -- Checkpoints and LoRAs, one row per model name (identity = case-folded name without
    -- folders or extension). Hashes differ by tool for the same file, so they aren't identity.
    CREATE TABLE models (
      id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('checkpoint', 'lora')),
      identity TEXT NOT NULL,
      display_name TEXT NOT NULL,
      UNIQUE (kind, identity)
    ) STRICT;

    CREATE TABLE model_hashes (
      model_id INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
      hash TEXT NOT NULL,
      hash_kind TEXT NOT NULL,
      PRIMARY KEY (model_id, hash)
    ) STRICT;
    CREATE INDEX model_hashes_hash ON model_hashes(hash);

    CREATE TABLE generations (
      image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
      generator TEXT NOT NULL,
      origin TEXT NOT NULL,
      prompt TEXT,
      negative_prompt TEXT,
      seed TEXT,
      steps INTEGER,
      cfg_scale REAL,
      sampler TEXT,
      scheduler TEXT,
      width INTEGER,
      height INTEGER,
      checkpoint_id INTEGER REFERENCES models(id),
      checkpoint_hash TEXT,
      refiner_id INTEGER REFERENCES models(id),
      refiner_hash TEXT,
      vae TEXT,
      styles_json TEXT,
      performance TEXT,
      params_json TEXT NOT NULL
    ) STRICT;
    CREATE INDEX generations_checkpoint ON generations(checkpoint_id);
    CREATE INDEX generations_refiner ON generations(refiner_id);
    CREATE INDEX generations_seed ON generations(seed);

    CREATE TABLE generation_loras (
      image_id INTEGER NOT NULL REFERENCES generations(image_id) ON DELETE CASCADE,
      model_id INTEGER NOT NULL REFERENCES models(id),
      position INTEGER NOT NULL,
      weight REAL,
      hash TEXT,
      PRIMARY KEY (image_id, model_id)
    ) STRICT;
    CREATE INDEX generation_loras_model ON generation_loras(model_id);

    CREATE TABLE metadata_raw (
      id INTEGER PRIMARY KEY,
      image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      origin TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL
    ) STRICT;
    CREATE INDEX metadata_raw_image ON metadata_raw(image_id);

    -- The size and mtime of each directory's log.html when it was last read.
    CREATE TABLE fooocus_logs (
      directory_id INTEGER PRIMARY KEY REFERENCES directories(id) ON DELETE CASCADE,
      size_bytes INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL
    ) STRICT;
  `
}
