import { GalleryScopeKind, type GalleryQuery } from '@shared/gallery'
import type { CriteriaFilter } from './criteria-filter'

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
  const { scope } = query
  const conditions = query.filters
    ? filters.flatMap((filter) => filter.condition(query.filters ?? {}) ?? [])
    : []
  const scoped = scope.kind === GalleryScopeKind.Directory
  const clauses = [
    ...(scoped
      ? [scope.recursive ? 'directory_id IN (SELECT id FROM subtree)' : 'directory_id = ?']
      : []),
    ...conditions.map((condition) => `(${condition.sql})`)
  ]
  return {
    prefix: scoped && scope.recursive ? SUBTREE : '',
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params: [
      ...(scoped ? [scope.directoryId] : []),
      ...conditions.flatMap((condition) => condition.params)
    ]
  }
}
