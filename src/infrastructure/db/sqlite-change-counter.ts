import type Database from 'better-sqlite3'
import type { ChangeCounter } from '@domain/change-counter'

/** Writes a component makes to scratch tables, which hold no library data. */
export interface ScratchWrites {
  readonly scratchWrites: number
}

/**
 * Counts the rows this connection has written to library tables. `total_changes()` also
 * moves for the facet reader's temp selection table, which every filtered gallery view
 * rewrites, so those writes are subtracted: otherwise browsing the gallery would forget the
 * stats on every click. It still moves for unrelated library writes (marks, hashes), which
 * only costs a recompute. It sees this connection's writes only, and no other connection
 * writes to the library.
 */
export class SqliteChangeCounter implements ChangeCounter {
  private readonly totalChanges: Database.Statement<[], number>

  constructor(
    db: Database.Database,
    private readonly scratch: ScratchWrites
  ) {
    this.totalChanges = db.prepare('SELECT total_changes()').pluck() as Database.Statement<
      [],
      number
    >
  }

  current(): number {
    return (this.totalChanges.get() as number) - this.scratch.scratchWrites
  }
}
