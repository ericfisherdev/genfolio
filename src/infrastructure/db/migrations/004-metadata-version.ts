import type { Migration } from './migration'

export const metadataVersionMigration: Migration = {
  version: 4,
  name: 'metadata index version per image',
  // 0 marks rows indexed before metadata extraction existed, so the next scan reads them.
  sql: `ALTER TABLE images ADD COLUMN metadata_version INTEGER NOT NULL DEFAULT 0;`
}
