import type Database from 'better-sqlite3'
import type { StoredFilterCodec } from '@domain/albums'
import { AlbumKind } from '@shared/album-kinds'
import { storedSearchFiltersSchema } from '@shared/search'
import type { CriteriaFilter, SqlCondition } from './criteria-filter'
import { allOf, filterConditions, type AlbumScopes } from './image-selection'

interface AlbumRow {
  kind: string
  filters_json: string | null
}

const NOTHING: SqlCondition = { sql: '0', params: [] }
const EVERYTHING: SqlCondition = { sql: '1', params: [] }

/**
 * Album scopes from the database: a manual album keeps its entries; a smart album is its
 * saved search, resolved afresh each time, so newly indexed matches appear. A smart album
 * whose stored search is invalid or names something that is gone matches nothing.
 */
export class SqliteAlbumScopes implements AlbumScopes {
  private readonly albumById: Database.Statement<[number], AlbumRow>

  constructor(
    db: Database.Database,
    private readonly criteria: readonly CriteriaFilter[],
    private readonly codec: StoredFilterCodec
  ) {
    this.albumById = db.prepare('SELECT kind, filters_json FROM albums WHERE id = ?')
  }

  condition(albumId: number): SqlCondition {
    const album = this.albumById.get(albumId)
    if (!album) return NOTHING
    if (album.kind === AlbumKind.Manual) {
      return {
        sql: 'id IN (SELECT image_id FROM album_images WHERE album_id = ?)',
        params: [albumId]
      }
    }
    const filters = this.savedSearch(album.filters_json)
    return filters ? (allOf(filterConditions(filters, this.criteria)) ?? EVERYTHING) : NOTHING
  }

  kindOf(albumId: number): AlbumKind | undefined {
    return this.albumById.get(albumId)?.kind as AlbumKind | undefined
  }

  private savedSearch(json: string | null): ReturnType<StoredFilterCodec['resolve']> {
    if (json === null) return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return undefined
    }
    const stored = storedSearchFiltersSchema.safeParse(parsed)
    return stored.success ? this.codec.resolve(stored.data) : undefined
  }
}
