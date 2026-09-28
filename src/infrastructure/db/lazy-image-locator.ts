import type Database from 'better-sqlite3'
import type { ImageLocator, StoredImageLocation } from '@domain/image-location'
import type { ImageId } from '@domain/library'
import { SqliteImageLocator } from './sqlite-image-locator'

/**
 * Opens its connection on first use and retries until it succeeds, because main may be asked
 * for an image before the library service has created the database. Until then every image
 * is unknown.
 */
export class LazyImageLocator implements ImageLocator {
  private locator: SqliteImageLocator | undefined

  constructor(private readonly open: () => Database.Database) {}

  locate(id: ImageId): StoredImageLocation | undefined {
    return this.connected()?.locate(id)
  }

  private connected(): SqliteImageLocator | undefined {
    if (!this.locator) {
      try {
        this.locator = new SqliteImageLocator(this.open())
      } catch {
        return undefined
      }
    }
    return this.locator
  }
}
