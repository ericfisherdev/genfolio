/** What changed under a watched folder, as a POSIX path relative to it. */
export interface WatchedChange {
  /** The folder whose contents changed (`''` for the watched folder itself). */
  readonly relDir: string
}

export interface WatchSubscription {
  close(): Promise<void>
}

/**
 * Follows a folder tree for image files (and Fooocus `log.html`) being written, changed or
 * removed, and folders being removed. Hidden entries and links are ignored. A file is
 * reported once it has stopped growing.
 */
export interface FileWatcher {
  watch(
    path: string,
    onChange: (change: WatchedChange) => void,
    /** The watch can't go on (such as the system's watch limit); it has been closed. */
    onFailure: (error: unknown) => void
  ): WatchSubscription
}
