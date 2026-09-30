import {
  type AppUpdater,
  CancellationToken,
  type ProgressInfo,
  type UpdateInfo
} from 'electron-updater'
import type { UpdateProgress } from '@shared/updates'
import { type AvailableUpdate, DownloadCancelledError, type UpdateSource } from './update-source'

/** The `{ info(), warn(), error() }` shape electron-updater logs through. */
export interface UpdaterLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/** Release notes longer than this are cut, with an ellipsis, for the dialog. */
const MAX_NOTES_LENGTH = 600
const HTML_TAG = /<[^>]*>/g
const HTML_BREAK = /<\/?(?:br|p|li|h\d|div|tr)[^>]*>/gi

/**
 * Updates through electron-updater's GitHub Releases feed (`resources/app-update.yml`, written by
 * electron-builder). Nothing downloads or installs on its own: `autoDownload` and
 * `autoInstallOnAppQuit` are off, so an update only proceeds through this object's methods.
 * The only place electron-updater is imported.
 */
export class ElectronUpdaterSource implements UpdateSource {
  private download_: CancellationToken | undefined

  constructor(
    private readonly updater: AppUpdater,
    logger: UpdaterLogger
  ) {
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.logger = logger
  }

  async check(): Promise<AvailableUpdate | null> {
    const result = await this.updater.checkForUpdates()
    if (result === null) throw new Error('This build cannot check for updates.')
    return result.isUpdateAvailable ? availableUpdate(result.updateInfo) : null
  }

  async download(onProgress: (progress: UpdateProgress) => void): Promise<void> {
    const forward = (info: ProgressInfo): void =>
      onProgress({
        percent: Math.min(100, Math.max(0, info.percent)),
        transferredBytes: Math.round(info.transferred),
        totalBytes: Math.round(info.total)
      })
    const token = new CancellationToken()
    this.download_ = token
    this.updater.on('download-progress', forward)
    try {
      await this.updater.downloadUpdate(token)
    } catch (error) {
      if (token.cancelled) throw new DownloadCancelledError()
      throw error
    } finally {
      this.updater.removeListener('download-progress', forward)
      this.download_ = undefined
    }
  }

  cancelDownload(): void {
    this.download_?.cancel()
  }

  install(): void {
    // quitAndInstall reports a failed install (a dismissed password prompt, a package manager
    // error) only through the synchronous `error` event and then returns; catch it in place.
    let failure: Error | undefined
    const onError = (error: Error): void => {
      failure ??= error
    }
    this.updater.on('error', onError)
    try {
      // Not silent (the package installers may show the system's authentication dialog), and
      // relaunch afterwards where the installer can.
      this.updater.quitAndInstall(false, true)
    } finally {
      this.updater.removeListener('error', onError)
    }
    if (failure) throw failure
  }
}

function availableUpdate(info: UpdateInfo): AvailableUpdate {
  return {
    version: info.version,
    releaseDate: info.releaseDate,
    notes: plainNotes(info.releaseNotes)
  }
}

/** GitHub release notes arrive as HTML (or a per-version list); the dialog shows plain text. */
export function plainNotes(notes: UpdateInfo['releaseNotes']): string | null {
  const html =
    typeof notes === 'string'
      ? notes
      : Array.isArray(notes)
        ? notes.map((entry) => entry.note ?? '').join('\n')
        : ''
  const text = html
    .replaceAll(HTML_BREAK, '\n')
    .replaceAll(HTML_TAG, '')
    .replaceAll(/[ \t]+/g, ' ')
    .replaceAll(/\n\s*\n+/g, '\n')
    .trim()
  if (text === '') return null
  return text.length > MAX_NOTES_LENGTH ? `${text.slice(0, MAX_NOTES_LENGTH - 1).trimEnd()}…` : text
}
