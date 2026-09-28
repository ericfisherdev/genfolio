import type { SearchFilters } from '@shared/search'

/** A condition on `images.id` with its bound parameters, in order. Never built from input. */
export interface SqlCondition {
  readonly sql: string
  readonly params: readonly unknown[]
}

/** One kind of search filter (OCP: a new filter is a new class). */
export interface CriteriaFilter {
  /** The condition this filter adds, or `undefined` when the filters don't use it. */
  condition(filters: SearchFilters): SqlCondition | undefined
}
