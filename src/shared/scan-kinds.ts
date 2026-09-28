// Runtime enums with no zod dependency, safe for the renderer bundle.

export enum ScanPhase {
  Walking = 'walking',
  Indexing = 'indexing',
  Pruning = 'pruning'
}

export enum ScanEventType {
  Progress = 'progress',
  Finished = 'finished',
  Failed = 'failed'
}
