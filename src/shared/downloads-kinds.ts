// Runtime enum with no zod dependency, safe for the renderer bundle.

export enum DownloadStatus {
  Queued = 'queued',
  Downloading = 'downloading',
  Completed = 'completed',
  /** The file was already in the folder, so nothing was fetched. */
  AlreadyExists = 'already-exists',
  Failed = 'failed',
  Cancelled = 'cancelled'
}

/** Whether the download has stopped, one way or another. */
export const isFinished = (status: DownloadStatus): boolean =>
  status !== DownloadStatus.Queued && status !== DownloadStatus.Downloading
