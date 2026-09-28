import type Database from 'better-sqlite3'
import type { TransactionRunner } from '@domain/transactions'

/** better-sqlite3 transactions; a nested `run` becomes a savepoint. */
export class SqliteTransactionRunner implements TransactionRunner {
  constructor(private readonly db: Database.Database) {}

  run<T>(work: () => T): T {
    return this.db.transaction(work)()
  }
}
