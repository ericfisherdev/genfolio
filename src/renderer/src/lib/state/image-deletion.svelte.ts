import { DeleteMode, type DeleteReport } from '@shared/deletion'
import { MAX_IDS_PER_MARK } from '@shared/gallery-kinds'
import type { GenfolioApi } from '@shared/genfolio-api'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

const count = new Intl.NumberFormat()
const images = (n: number): string => `${count.format(n)} image${n === 1 ? '' : 's'}`

/**
 * Deleting images through main, which verifies every path and confirms anything permanent.
 * Says what happened in the notice bar and keeps a report of failures for the report dialog;
 * after any change it calls `onchange` so the library, its counts and the results reload.
 * Never rejects.
 */
export class ImageDeletion {
  /** The last delete's report while it has failures to show. */
  report: DeleteReport | undefined = $state.raw()

  constructor(
    private readonly api: Pick<GenfolioApi, 'deleteImages'>,
    private readonly notices: NoticeSink,
    private readonly onchange: () => void
  ) {}

  /** Resolves the report, or `undefined` when the request failed (already reported). */
  async delete(imageIds: readonly number[], mode: DeleteMode): Promise<DeleteReport | undefined> {
    if (imageIds.length === 0) return undefined
    let report: DeleteReport
    try {
      report = await this.inChunks(imageIds, mode)
    } catch (error) {
      this.notices.notify(`Could not delete: ${userMessage(error)}`)
      return undefined
    }
    if (report.cancelled) return report
    this.notices.notify(summary(report, mode))
    if (report.failed.length > 0) this.report = report
    if (report.deleted.length > 0 || report.missing.length > 0) this.onchange()
    return report
  }

  dismissReport(): void {
    this.report = undefined
  }

  /** Sends at most MAX_IDS_PER_MARK per request; a cancelled confirmation stops the rest. */
  private async inChunks(imageIds: readonly number[], mode: DeleteMode): Promise<DeleteReport> {
    const total = {
      cancelled: false,
      deleted: [] as number[],
      missing: [] as number[],
      failed: [] as DeleteReport['failed'][number][]
    }
    for (let start = 0; start < imageIds.length; start += MAX_IDS_PER_MARK) {
      const part = await this.api.deleteImages(
        imageIds.slice(start, start + MAX_IDS_PER_MARK),
        mode
      )
      if (part.cancelled) return { ...total, cancelled: start === 0 }
      total.deleted.push(...part.deleted)
      total.missing.push(...part.missing)
      total.failed.push(...part.failed)
    }
    return total
  }
}

function summary(report: DeleteReport, mode: DeleteMode): string {
  const done =
    mode === DeleteMode.Trash
      ? `Moved ${images(report.deleted.length)} to the trash.`
      : `Deleted ${images(report.deleted.length)}.`
  const gone = report.missing.length
  const already = gone > 0 ? ` ${images(gone)} ${gone === 1 ? 'was' : 'were'} already gone.` : ''
  const failed = report.failed.length
  return `${done}${already}${failed > 0 ? ` Could not delete ${images(failed)}.` : ''}`
}
