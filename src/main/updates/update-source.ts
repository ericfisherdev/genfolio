import type { UpdateProgress } from '@shared/updates'

/** A newer release than the running one. */
export interface AvailableUpdate {
  readonly version: string
  /** ISO 8601. */
  readonly releaseDate: string
  /** The release notes as plain text, or null when the release has none. */
  readonly notes: string | null
}

/** Thrown by {@link UpdateSource.download} when {@link UpdateSource.cancelDownload} stopped it. */
export class DownloadCancelledError extends Error {
  constructor() {
    super('The download was cancelled.')
    this.name = 'DownloadCancelledError'
  }
}

/**
 * Where updates come from and how they are applied. One check, then at most one download and
 * one install, in that order.
 */
export interface UpdateSource {
  /**
   * The newer release, or null when the running version is the latest.
   * @throws Error when the feed can't be read or this build can't be updated.
   */
  check(): Promise<AvailableUpdate | null>
  /**
   * Downloads the release found by the last {@link check}.
   * @throws DownloadCancelledError when cancelled; Error when the download or its checksum failed.
   */
  download(onProgress: (progress: UpdateProgress) => void): Promise<void>
  /** Stops a running download; a no-op otherwise. */
  cancelDownload(): void
  /**
   * Quits and installs the downloaded release, relaunching when the installer allows.
   * @throws Error when the install failed or the authentication prompt was dismissed; the app
   *   then stays open.
   */
  install(): void
}
