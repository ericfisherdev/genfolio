import type { Migration } from './migration'

export const similarityMigration: Migration = {
  version: 7,
  name: 'content and perceptual hashes, similar pairs and groups',
  // Hashes are derived from the file, so a changed file (the upsert sees a new size or mtime)
  // clears them and its pairs; hash_version 0 means "to hash". Pairs are kept up to the
  // largest threshold, so a new threshold regroups without comparing hashes again.
  sql: `
    ALTER TABLE images ADD COLUMN content_sha256 BLOB
      CHECK (content_sha256 IS NULL OR length(content_sha256) = 32);
    ALTER TABLE images ADD COLUMN dhash INTEGER;
    ALTER TABLE images ADD COLUMN phash INTEGER;
    ALTER TABLE images ADD COLUMN hash_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE images ADD COLUMN similar_group_id INTEGER;
    CREATE INDEX images_content_sha256 ON images(content_sha256)
      WHERE content_sha256 IS NOT NULL;
    CREATE INDEX images_similar_group ON images(similar_group_id)
      WHERE similar_group_id IS NOT NULL;
    CREATE INDEX images_hash_version ON images(hash_version, id);

    CREATE TABLE similar_pairs (
      a_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      b_id INTEGER NOT NULL REFERENCES images(id) ON DELETE CASCADE,
      distance INTEGER NOT NULL CHECK (distance BETWEEN 0 AND 64),
      PRIMARY KEY (a_id, b_id),
      CHECK (a_id < b_id)
    ) STRICT, WITHOUT ROWID;
    CREATE INDEX similar_pairs_b ON similar_pairs(b_id);

    CREATE TRIGGER images_hash_reset AFTER UPDATE OF hash_version ON images
    WHEN NEW.hash_version = 0 AND OLD.hash_version <> 0
    BEGIN
      DELETE FROM similar_pairs WHERE a_id = NEW.id OR b_id = NEW.id;
    END;

    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
  `
}
