import type { Migration } from './migration'

export const userDataMigration: Migration = {
  version: 6,
  name: 'favourites, ratings, tags, albums and slideshow presets',
  // User-owned data, keyed by image id: rescans keep the row (upsert) and so keep all of it.
  // Names are unique on name_key, which the repositories fold with nameKey() (NFC, trimmed,
  // lower-cased); SQLite's NOCASE folds ASCII only, so it would keep `Élan` and `élan` apart.
  sql: `
    ALTER TABLE images ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0
      CHECK (is_favorite IN (0, 1));
    ALTER TABLE images ADD COLUMN rating INTEGER NOT NULL DEFAULT 0
      CHECK (rating BETWEEN 0 AND 5);
    CREATE INDEX images_rating ON images(rating, created_at, id);
    -- Keyed on the default sort, so the favourites view reads in order without a sort step.
    CREATE INDEX images_favorite ON images(created_at, id) WHERE is_favorite = 1;

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      -- Checked on the key, trimmed as the app trims (SQLite's trim() strips only spaces).
      name_key TEXT NOT NULL UNIQUE CHECK (length(name_key) > 0),
      created_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE image_tags (
      image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (image_id, tag_id)
    ) STRICT;
    CREATE INDEX image_tags_tag ON image_tags(tag_id, image_id);

    CREATE TABLE albums (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      -- Checked on the key, trimmed as the app trims (SQLite's trim() strips only spaces).
      name_key TEXT NOT NULL UNIQUE CHECK (length(name_key) > 0),
      kind TEXT NOT NULL CHECK (kind IN ('manual', 'smart')),
      -- Smart albums: StoredSearchFilters (shared/search.ts), which name models by
      -- (kind, identity) and a prompt by its text, never by row id: ids are recycled after
      -- models are pruned or images deleted. Resolved to ids when the album is opened.
      filters_json TEXT
        CHECK (filters_json IS NULL OR (json_valid(filters_json) AND length(filters_json) <= 65536)),
      cover_image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      CHECK ((kind = 'smart') = (filters_json IS NOT NULL))
    ) STRICT;

    CREATE TABLE album_images (
      album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
      image_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      -- Fractional, so an image moves between two others without renumbering the album.
      position REAL NOT NULL,
      PRIMARY KEY (album_id, image_id)
    ) STRICT;
    CREATE INDEX album_images_position ON album_images(album_id, position);
    CREATE INDEX album_images_image ON album_images(image_id);

    CREATE TABLE slideshow_presets (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(trim(name)) > 0),
      -- Checked on the key, trimmed as the app trims (SQLite's trim() strips only spaces).
      name_key TEXT NOT NULL UNIQUE CHECK (length(name_key) > 0),
      interval_ms INTEGER NOT NULL CHECK (interval_ms BETWEEN 2000 AND 60000),
      shuffle INTEGER NOT NULL CHECK (shuffle IN (0, 1)),
      loop INTEGER NOT NULL CHECK (loop IN (0, 1)),
      show_prompt INTEGER NOT NULL CHECK (show_prompt IN (0, 1))
    ) STRICT;
  `
}
