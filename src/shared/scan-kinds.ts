// Runtime enums with no zod dependency, safe for the renderer bundle.

export enum ScanPhase {
  Walking = 'walking',
  Indexing = 'indexing',
  Pruning = 'pruning'
}

export enum ScanEventType {
  Progress = 'progress',
  Finished = 'finished',
  Failed = 'failed',
  /** Library-wide background hashing for look-alikes, after scans. */
  Hashing = 'hashing',
  /** A root can't be watched for changes; it is rescanned periodically instead. */
  WatchUnavailable = 'watch-unavailable'
}
