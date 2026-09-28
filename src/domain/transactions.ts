/** Runs work atomically: every write inside commits together or not at all. */
export interface TransactionRunner {
  /** Returns what `work` returns; rethrows what it throws after rolling back. Nests. */
  run<T>(work: () => T): T
}
