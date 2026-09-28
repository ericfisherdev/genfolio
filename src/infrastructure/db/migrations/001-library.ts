import type { Migration } from './migration'

export const libraryMigration: Migration = {
  version: 1,
  name: 'library roots, directories, images',
  sql: `
    CREATE TABLE library_roots (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      added_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE directories (
      id INTEGER PRIMARY KEY,
      root_id INTEGER NOT NULL REFERENCES library_roots(id) ON DELETE CASCADE,
      parent_id INTEGER REFERENCES directories(id) ON DELETE CASCADE,
      rel_path TEXT NOT NULL,
      UNIQUE (root_id, rel_path)
    ) STRICT;
    CREATE INDEX directories_parent ON directories(parent_id);

    CREATE TABLE images (
      id INTEGER PRIMARY KEY,
      directory_id INTEGER NOT NULL REFERENCES directories(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      format TEXT NOT NULL CHECK (format IN ('png', 'jpeg', 'webp', 'avif', 'gif')),
      size_bytes INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      width INTEGER NOT NULL CHECK (width > 0),
      height INTEGER NOT NULL CHECK (height > 0),
      created_at INTEGER NOT NULL,
      added_at INTEGER NOT NULL,
      UNIQUE (directory_id, file_name)
    ) STRICT;
    CREATE INDEX images_created_at ON images(created_at, id);
    CREATE INDEX images_added_at ON images(added_at, id);
    CREATE INDEX images_file_name ON images(file_name, id);
  `
}
