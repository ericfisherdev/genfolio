import type { GenfolioApi } from '@shared/genfolio-api'
import type { ScanReport } from '@shared/scan'
import type { NoticeAction, NoticeSink } from './notice-sink'

const count = new Intl.NumberFormat()

/**
 * Tells the user about problems they can't see otherwise (files a scan couldn't read,
 * unexpected errors), with a way to the logs that hold the details.
 */
export class ProblemReports {
  private readonly openLogs: NoticeAction

  constructor(
    private readonly api: Pick<GenfolioApi, 'openLogs' | 'reportRendererError'>,
    private readonly notices: NoticeSink
  ) {
    this.openLogs = { label: 'Open logs', run: () => void this.api.openLogs() }
  }

  scanFinished(report: ScanReport | undefined): void {
    if (!report || report.failed === 0) return
    const files = `${count.format(report.failed)} file${report.failed === 1 ? '' : 's'}`
    this.notices.notify(`${files} could not be read as images.`, this.openLogs)
  }

  /** An error nothing else handled: recorded in main's log by its name only. */
  unexpected(error: unknown): void {
    const name = error instanceof Error ? error.name : 'Error'
    void this.api.reportRendererError(name.slice(0, 100)).catch(() => undefined)
    this.notices.notify(`Something went wrong (${name}).`, this.openLogs)
  }
}
