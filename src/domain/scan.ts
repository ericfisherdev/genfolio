import type { ScanPhase } from '@shared/scan'
import type { RootId } from './library'

export { ScanPhase } from '@shared/scan'
export type { ScanReport } from '@shared/scan'

export interface ScanProgress {
  readonly rootId: RootId
  readonly phase: ScanPhase
  readonly done: number
  /** Unknown while walking. */
  readonly total: number | undefined
}

/** An image-extension file found below a root. `relDir` is POSIX-style, `''` for the root. */
export interface FoundFile {
  readonly relDir: string
  readonly fileName: string
  readonly sizeBytes: number
  readonly mtimeMs: number
  /** An A1111 `<stem>.txt` sits beside the image, so readers needn't probe for one. */
  readonly hasTextSidecar: boolean
}

export interface FileWalker {
  /**
   * Yields image-extension files below `rootPath`; stops early when `signal` aborts.
   * Rejects when `rootPath` itself cannot be read (e.g. an unmounted drive). Unreadable
   * subdirectories are skipped and reported through `onSkippedDir` so callers do not treat
   * their contents as deleted.
   */
  walk(
    rootPath: string,
    signal: AbortSignal,
    onSkippedDir?: (relDir: string) => void
  ): AsyncIterable<FoundFile>
}

export interface ScanLogger {
  /** `fileRef` identifies the file without revealing its path. */
  warn(message: string, fileRef: string): void
}
