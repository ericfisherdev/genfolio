// Constants with no zod dependency, safe for the renderer bundle.

/** Most rows any stats list returns; every list is cut to the request's limit. */
export const MAX_STATS_ROWS = 200

/** Rows per list when a request names no limit. */
export const DEFAULT_STATS_ROWS = 25
