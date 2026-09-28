import { GalleryScopeKind, type GalleryQuery } from '@shared/gallery'
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

export function selectImages(
  query: Pick<GalleryQuery, 'scope' | 'filters'>,
  filters: readonly CriteriaFilter[]
): ImageSelection {
  const conditions = query.filters
    ? filters.flatMap((filter) => filter.condition(query.filters ?? {}) ?? [])
    : []
  const scope = scopeCondition(query.scope)
  const clauses = [...(scope ? [scope] : []), ...conditions]
  return {
    prefix: query.scope.kind === GalleryScopeKind.Directory && query.scope.recursive ? SUBTREE : '',
    where:
      clauses.length > 0
        ? `WHERE ${clauses.map((condition) => `(${condition.sql})`).join(' AND ')}`
        : '',
    params: clauses.flatMap((condition) => condition.params)
  }
}

/** What the scope keeps, or `undefined` for the whole library. */
function scopeCondition(scope: GalleryQuery['scope']): SqlCondition | undefined {
  switch (scope.kind) {
    case GalleryScopeKind.All:
      return undefined
    case GalleryScopeKind.Directory:
      // The recursive form binds the subtree CTE's root, which the prefix puts first.
      return scope.recursive
        ? { sql: 'directory_id IN (SELECT id FROM subtree)', params: [scope.directoryId] }
        : { sql: 'directory_id = ?', params: [scope.directoryId] }
    case GalleryScopeKind.Album:
      return {
        sql: 'id IN (SELECT image_id FROM album_images WHERE album_id = ?)',
        params: [scope.albumId]
      }
  }
}
