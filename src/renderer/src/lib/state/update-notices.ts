import type { GenfolioApi } from '@shared/genfolio-api'
import { formatBytes } from '@shared/format-bytes'
import { UpdatePhase } from '@shared/update-kinds'
import type { UpdateEvent } from '@shared/updates'
import type { NoticeSink } from './notice-sink'

/**
 * Tells the notice bar how an in-app update is going. The decisions happen in main's dialogs;
 * this only reflects the phases that take time or end the flow without a dialog.
 */
export class UpdateNotices {
  private readonly unsubscribe: () => void

  constructor(
    private readonly api: Pick<GenfolioApi, 'onUpdateEvent' | 'cancelUpdateDownload'>,
    private readonly notices: NoticeSink & { dismissNotice(): void }
  ) {
    this.unsubscribe = api.onUpdateEvent((event) => this.handle(event))
  }

  handle(event: UpdateEvent): void {
    switch (event.phase) {
      case UpdatePhase.Checking:
        this.notices.notify('Checking for updates…')
        return
      case UpdatePhase.Downloading:
        this.notices.notify(downloadMessage(event), {
          label: 'Cancel',
          run: () => void this.api.cancelUpdateDownload()
        })
        return
      case UpdatePhase.Downloaded:
        this.notices.notify(`Genfolio ${event.version ?? ''} is downloaded and ready to install.`)
        return
      case UpdatePhase.Installing:
        this.notices.notify(`Installing Genfolio ${event.version ?? ''}…`)
        return
      case UpdatePhase.Cancelled:
        this.notices.notify('The update download was cancelled.')
        return
      case UpdatePhase.Failed:
        this.notices.notify(`Could not update Genfolio: ${event.message ?? 'unknown error'}`)
        return
      case UpdatePhase.UpToDate:
      case UpdatePhase.Available:
        // Main shows a dialog for these; the "Checking…" notice has served its purpose.
        this.notices.dismissNotice()
        return
    }
  }

  dispose(): void {
    this.unsubscribe()
  }
}

function downloadMessage(event: UpdateEvent): string {
  const version = event.version ?? ''
  const progress = event.progress
  if (!progress || progress.totalBytes === 0) return `Downloading Genfolio ${version}…`
  const percent = Math.floor(progress.percent)
  return `Downloading Genfolio ${version}… ${percent}% (${formatBytes(progress.transferredBytes)} of ${formatBytes(progress.totalBytes)})`
}
