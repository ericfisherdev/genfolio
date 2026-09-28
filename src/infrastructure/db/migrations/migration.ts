/** One forward-only schema step. `version` values must run 1, 2, 3, … without gaps. */
export interface Migration {
  readonly version: number
  readonly name: string
  readonly sql: string
}
