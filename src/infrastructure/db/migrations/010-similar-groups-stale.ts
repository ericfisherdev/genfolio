import { SIMILAR_GROUPS_STALE_KEY } from '@domain/similarity'
import type { Migration } from './migration'

const markStale = `
  INSERT INTO app_settings (key, value) VALUES ('${SIMILAR_GROUPS_STALE_KEY}', '1')
  ON CONFLICT (key) DO UPDATE SET value = '1';`

export const similarGroupsStaleMigration: Migration = {
  version: 10,
  name: 'remember that similar groups are out of date when a grouped image changes or leaves',
  // A changed file loses its pairs (images_hash_reset) and a deleted one cascades its pairs,
  // but the images it was grouped with keep their group id until the next regroup. The flag is
  // written by the statement that makes the groups stale, so a scan that stops half-way, a
  // crash or a restart cannot lose it. Seeded stale: groups that went stale before this
  // migration are rebuilt once.
  sql: `
    CREATE TRIGGER images_groups_stale_on_change AFTER UPDATE OF hash_version ON images
    WHEN NEW.hash_version = 0 AND OLD.similar_group_id IS NOT NULL
    BEGIN${markStale}
    END;

    CREATE TRIGGER images_groups_stale_on_delete AFTER DELETE ON images
    WHEN OLD.similar_group_id IS NOT NULL
    BEGIN${markStale}
    END;
    ${markStale}
  `
}
