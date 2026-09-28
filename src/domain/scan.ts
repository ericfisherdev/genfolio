import type { RootId } from './library'

export enum ScanPhase {
  Walking = 'walking',
  Indexing = 'indexing',
  Pruning = 'pruning'
}

export interface ScanProgress {
  readonly rootId: RootId
  readonly phase: ScanPhase
  readonly done: number
  /** Unknown while walking. */
  readonly total: number | undefined
}

export interface ScanReport {
  readonly added: number
  readonly updated: number
  readonly unchanged: number
  readonly removed: number
  /** Files that looked like images but could not be read or parsed. */
  readonly failed: number
}

/** An image-extension file found below a root. `relDir` is POSIX-style, `''` for the root. */
export interface FoundFile {
  readonly relDir: string
  readonly fileName: string
  readonly sizeBytes: number
  readonly mtimeMs: number
}

export interface FileWalker {
  /** Yields image-extension files below `rootPath`; stops early when `signal` aborts. */
  walk(rootPath: string, signal: AbortSignal): AsyncIterable<FoundFile>
}

export interface ScanLogger {
  /** `fileRef` identifies the file without revealing its path. */
  warn(message: string, fileRef: string): void
}
