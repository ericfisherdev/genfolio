import type { DownloadPlan } from '@shared/civitai-browse'
import type { ModelKind } from '@shared/generation-kinds'
import type { ModelFolders } from '@shared/model-folders'

/** A download that can't go on, with a reason fit to show the user. */
export class DownloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DownloadError'
  }
}

/** Says what a version of a Civitai model would download; null when there is nothing to. */
export interface DownloadPlanner {
  plan(modelId: number, versionId: number): Promise<DownloadPlan | null>
}

/** Where downloaded models go, per kind. */
export interface ModelFolderProvider {
  folders(): Promise<ModelFolders>
}

/** A file being written: bytes land in a temporary file that only `publish` makes the real one. */
export interface PartialFile {
  write(chunk: Uint8Array): Promise<void>
  /** Flushes and closes; what was written and its SHA-256 (lower-case hex). */
  finish(): Promise<{ bytes: number; sha256: string }>
  /** Makes the finished file appear under its name; throws DownloadError if one is there now. */
  publish(): Promise<void>
  /** Closes and removes what was written. Safe to call after any other step, more than once. */
  discard(): Promise<void>
}

export interface DownloadFiles {
  /** The folder for `name` inside `root`: an existing one named alike ignoring case, else `name`. */
  resolveFolder(root: string, name: string): Promise<string>
  exists(path: string): Promise<boolean>
  /** Creates the folder if it is not there. */
  ensureFolder(path: string): Promise<void>
  /** Removes the folder if it has nothing in it; any other folder is left alone. */
  removeEmptyFolder(path: string): Promise<void>
  /** Starts a file at `path` that is not there yet. */
  begin(path: string): Promise<PartialFile>
}

export interface DownloadBody {
  readonly chunks: AsyncIterable<Uint8Array>
  /** The size the server announced; null when it didn't. */
  readonly totalBytes: number | null
}

/** Fetches a file from the net. Rejects with DownloadError, its message fit to show. */
export interface DownloadSource {
  open(url: string, signal: AbortSignal): Promise<DownloadBody>
}

/** Notes a finished download where the app keeps what it knows about models. */
export interface DownloadRecorder {
  record(kind: ModelKind, fileName: string, modelId: number, versionId: number): Promise<void>
}
