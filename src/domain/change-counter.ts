/** A number that differs whenever data a cached read may depend on has been written. */
export interface ChangeCounter {
  /** Unchanged only while nothing was written; it may also move for writes a read ignores. */
  current(): number
}
