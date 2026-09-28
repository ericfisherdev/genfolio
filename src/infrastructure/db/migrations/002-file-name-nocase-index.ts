import type { Migration } from './migration'

export const fileNameNocaseIndexMigration: Migration = {
  version: 2,
  name: 'case-insensitive file name index',
  sql: `
    DROP INDEX images_file_name;
    CREATE INDEX images_file_name_nocase ON images(file_name COLLATE NOCASE, id);
  `
}
