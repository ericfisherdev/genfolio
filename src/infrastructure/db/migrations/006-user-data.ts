import type { Migration } from './migration'

export const userDataMigration: Migration = {
  version: 6,
  name: 'favourites, ratings, tags, albums and slideshow presets',
  // User-owned data, keyed by image id: rescans keep the row (upsert) and so keep all of it.
  sql: `
    ALTER TABLE images ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0
      CHECK (is_favorite IN (0, 1));
    ALTER TABLE images ADD COLUMN rating INTEGER NOT NULL DEFAULT 0
      CHECK (rating BETWEEN 0 AND 5);
    CREATE INDEX images_rating ON images(rating, created_at, id);
    CREATE INDEX images_favorite ON images(is_favorite) WHERE is_favorite = 1;

    CREATE TABLE tags (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
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
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      kind TEXT NOT NULL CHECK (kind IN ('manual', 'smart')),
      -- Smart albums: the saved SearchFilters, validated against the shared schema on read.
      filters_json TEXT,
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
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      interval_ms INTEGER NOT NULL CHECK (interval_ms BETWEEN 2000 AND 60000),
      shuffle INTEGER NOT NULL CHECK (shuffle IN (0, 1)),
      loop INTEGER NOT NULL CHECK (loop IN (0, 1)),
      show_prompt INTEGER NOT NULL CHECK (show_prompt IN (0, 1))
    ) STRICT;
  `
}
