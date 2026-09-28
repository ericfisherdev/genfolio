import type Database from 'better-sqlite3'
import { createSearchFilters } from './filters'
import { ImageSelector } from './image-selection'
import { SqliteAlbumScopes } from './sqlite-album-scopes'
import { SqliteStoredFilterCodec } from './stored-filter-codec'

/** The selector the readers share: every search filter, and albums read from `db`. */
export function createImageSelector(db: Database.Database): ImageSelector {
  const criteria = createSearchFilters()
  return new ImageSelector(
    criteria,
    new SqliteAlbumScopes(db, criteria, new SqliteStoredFilterCodec(db))
  )
}
