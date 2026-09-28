import type { AlbumKind } from '@shared/album-kinds'
import { GalleryScopeKind, type GalleryQuery } from '@shared/gallery'
import type { SearchFilters } from '@shared/search'
import type { CriteriaFilter, SqlCondition } from './criteria-filter'

const SUBTREE = `WITH RECURSIVE subtree(id) AS (
    SELECT ?
    UNION ALL
    SELECT directories.id FROM directories JOIN subtree ON directories.parent_id = subtree.id
  )`

/**
 * The images a query's scope and filters select, as SQL pieces: `prefix` (a CTE, or empty)
 * must start the statement, `where` (empty or `WHERE …`) applies to `images`, and `params`
 * bind in that order. The text depends only on which filters are in use, never on values.
 */
export interface ImageSelection {
  readonly prefix: string
  readonly where: string
  readonly params: readonly unknown[]
}

/** What an album keeps, which depends on its kind and, for a smart album, its saved search. */
export interface AlbumScopes {
  /** The album's images: its entries or its saved search; nothing when it is gone. */
  condition(albumId: number): SqlCondition
  kindOf(albumId: number): AlbumKind | undefined
}

/** The conditions the filters add, one per filter in use. */
export function filterConditions(
  filters: SearchFilters,
  criteria: readonly CriteriaFilter[]
): SqlCondition[] {
  return criteria.flatMap((filter) => filter.condition(filters) ?? [])
}

/** Joins conditions with AND; `undefined` when there are none. */
export function allOf(conditions: readonly SqlCondition[]): SqlCondition | undefined {
  if (conditions.length === 0) return undefined
  return {
    sql: conditions.map((condition) => `(${condition.sql})`).join(' AND '),
    params: conditions.flatMap((condition) => condition.params)
  }
}

/** Turns gallery queries into the SQL that selects their images. */
export class ImageSelector {
  constructor(
    private readonly criteria: readonly CriteriaFilter[],
    private readonly albums: AlbumScopes
  ) {}

  select(query: Pick<GalleryQuery, 'scope' | 'filters'>): ImageSelection {
    const scope = this.scopeCondition(query.scope)
    const filters = query.filters ? filterConditions(query.filters, this.criteria) : []
    const where = allOf([...(scope ? [scope] : []), ...filters])
    return {
      prefix:
        query.scope.kind === GalleryScopeKind.Directory && query.scope.recursive ? SUBTREE : '',
      where: where ? `WHERE ${where.sql}` : '',
      params: where?.params ?? []
    }
  }

  albumKind(albumId: number): AlbumKind | undefined {
    return this.albums.kindOf(albumId)
  }

  /** What the scope keeps, or `undefined` for the whole library. */
  private scopeCondition(scope: GalleryQuery['scope']): SqlCondition | undefined {
    switch (scope.kind) {
      case GalleryScopeKind.All:
        return undefined
      case GalleryScopeKind.Directory:
        // The recursive form binds the subtree CTE's root, which the prefix puts first.
        return scope.recursive
          ? { sql: 'directory_id IN (SELECT id FROM subtree)', params: [scope.directoryId] }
          : { sql: 'directory_id = ?', params: [scope.directoryId] }
      case GalleryScopeKind.Album:
        return this.albums.condition(scope.albumId)
    }
  }
}
