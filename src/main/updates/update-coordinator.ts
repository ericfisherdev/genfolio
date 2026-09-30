import type { MessageBoxOptions, MessageBoxReturnValue } from 'electron'
import { InstallMethod, UpdatePhase } from '@shared/update-kinds'
import type { UpdateEvent, UpdateProgress } from '@shared/updates'
import { installAsksForPassword } from './install-method'
import { type AvailableUpdate, DownloadCancelledError, type UpdateSource } from './update-source'

/** Shows a modal message box and resolves the button chosen; injectable for tests. */
export type ShowMessageBox = (options: MessageBoxOptions) => Promise<MessageBoxReturnValue>

export interface UpdateCoordinatorDependencies {
  readonly source: UpdateSource
  readonly installMethod: InstallMethod
  readonly currentVersion: string
  /** The releases page, offered as the manual way when an update can't be applied. */
  readonly releasesUrl: string
  readonly show: ShowMessageBox
  readonly openExternal: (url: string) => void
  /** Reports each phase to the renderer's notice bar. */
  readonly publish: (event: UpdateEvent) => void
  readonly log: { info(message: string): void; error(message: string): void }
}

/** Button indexes shared by the dialogs: the action first, the dismissal second. */
const PRIMARY = 0
const LATER = 1
const RELEASES_PAGE = 2

const PASSWORD_NOTE = 'Your system will ask for your password to install the package.'

/**
 * The "Check for Updates…" flow: check, offer, download, install, each step confirmed in a
 * dialog shown by main. Nothing runs without the user asking; one flow at a time. Errors are
 * logged by name only (messages can hold URLs and paths) and shown to the user in full.
 */
export class UpdateCoordinator {
  private running = false
  private downloading = false

  constructor(private readonly deps: UpdateCoordinatorDependencies) {}

  /** Whether a check, download or install is in progress. */
  get busy(): boolean {
    return this.running
  }

  /** Runs the whole flow; resolves when it ends, however it ends. Never rejects. */
  async checkInteractively(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.run()
    } catch (error) {
      this.fail(error)
      await this.explainFailure(error)
    } finally {
      this.running = false
    }
  }

  /** Stops a download the user started; a no-op otherwise. */
  cancelDownload(): void {
    if (this.downloading) this.deps.source.cancelDownload()
  }

  private async run(): Promise<void> {
    if (this.deps.installMethod === InstallMethod.Unsupported) {
      await this.offerReleasesPage(
        'This build cannot update itself.',
        'Updates apply to the installed AppImage, pacman or deb packages. ' +
          'Downloads are on the releases page.'
      )
      return
    }
    this.emit(UpdatePhase.Checking, null)
    const update = await this.deps.source.check()
    if (update === null) {
      this.emit(UpdatePhase.UpToDate, null)
      await this.deps.show({
        type: 'info',
        message: `Genfolio ${this.deps.currentVersion} is up to date.`,
        buttons: ['OK'],
        noLink: true
      })
      return
    }
    this.emit(UpdatePhase.Available, update.version)
    this.deps.log.info(`update available: ${update.version}`)
    if (!(await this.offerUpdate(update))) return
    if (!(await this.download(update))) return
    if (await this.confirmInstall(update)) {
      this.emit(UpdatePhase.Installing, update.version)
      this.deps.log.info(`installing update ${update.version}`)
      this.deps.source.install()
    }
  }

  /** True when the user chose to update now. */
  private async offerUpdate(update: AvailableUpdate): Promise<boolean> {
    const lines = [`You have Genfolio ${this.deps.currentVersion}.`]
    if (installAsksForPassword(this.deps.installMethod)) lines.push(PASSWORD_NOTE)
    if (update.notes) lines.push('', update.notes)
    const { response } = await this.deps.show({
      type: 'info',
      message: `Genfolio ${update.version} is available.`,
      detail: lines.join('\n'),
      buttons: ['Update now', 'Later', 'View release'],
      defaultId: PRIMARY,
      cancelId: LATER,
      noLink: true
    })
    if (response === RELEASES_PAGE) this.deps.openExternal(this.deps.releasesUrl)
    return response === PRIMARY
  }

  /** True when the download completed; false when the user cancelled it. */
  private async download(update: AvailableUpdate): Promise<boolean> {
    this.downloading = true
    this.emit(UpdatePhase.Downloading, update.version, {
      percent: 0,
      transferredBytes: 0,
      totalBytes: 0
    })
    try {
      await this.deps.source.download((progress) =>
        this.emit(UpdatePhase.Downloading, update.version, progress)
      )
    } catch (error) {
      if (!(error instanceof DownloadCancelledError)) throw error
      this.emit(UpdatePhase.Cancelled, update.version)
      return false
    } finally {
      this.downloading = false
    }
    this.emit(UpdatePhase.Downloaded, update.version)
    return true
  }

  /** True when the user chose to install now; declining keeps the download for next time. */
  private async confirmInstall(update: AvailableUpdate): Promise<boolean> {
    const detail = installAsksForPassword(this.deps.installMethod)
      ? 'Genfolio will close and your system will ask for your password to install the ' +
        'package. It restarts once the package is installed.'
      : 'Genfolio will close and restart as the new version.'
    const { response } = await this.deps.show({
      type: 'question',
      message: `Install Genfolio ${update.version}?`,
      detail,
      buttons: ['Install and restart', 'Later'],
      defaultId: PRIMARY,
      cancelId: LATER,
      noLink: true
    })
    return response === PRIMARY
  }

  private async offerReleasesPage(message: string, detail: string): Promise<void> {
    const { response } = await this.deps.show({
      type: 'info',
      message,
      detail,
      buttons: ['Open releases page', 'Close'],
      defaultId: PRIMARY,
      cancelId: LATER,
      noLink: true
    })
    if (response === PRIMARY) this.deps.openExternal(this.deps.releasesUrl)
  }

  private fail(error: unknown): void {
    this.deps.log.error(`update failed: ${error instanceof Error ? error.name : 'unknown error'}`)
    this.emit(UpdatePhase.Failed, null, null, messageOf(error))
  }

  private explainFailure(error: unknown): Promise<void> {
    return this.offerReleasesPage(
      'Could not update Genfolio.',
      `${messageOf(error)}\n\nYou can download the latest release by hand instead.`
    )
  }

  private emit(
    phase: UpdatePhase,
    version: string | null,
    progress: UpdateProgress | null = null,
    message: string | null = null
  ): void {
    this.deps.publish({ phase, version, progress, message })
  }
}

/** Longer reasons (electron-updater appends headers and stacks) are cut for the dialog. */
const MAX_REASON_LENGTH = 200

/** The first line of the error's message, cut to a dialog-sized length. */
export function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  const line = text.split('\n', 1)[0]?.trim() ?? ''
  const reason = line === '' ? 'unknown error' : line
  return reason.length > MAX_REASON_LENGTH
    ? `${reason.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…`
    : reason
}
