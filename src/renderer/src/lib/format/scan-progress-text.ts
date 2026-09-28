import { ScanPhase } from '@shared/scan-kinds'

export interface ScanProgressView {
  readonly phase: ScanPhase
  readonly done: number
  readonly total: number | null
}

const count = new Intl.NumberFormat()

/** Short status line for a running scan, e.g. "Indexing 120 / 4,500". */
export function scanProgressText(progress: ScanProgressView): string {
  switch (progress.phase) {
    case ScanPhase.Walking:
      return `Finding images… ${count.format(progress.done)}`
    case ScanPhase.Indexing:
      return `Indexing ${count.format(progress.done)} / ${count.format(progress.total ?? 0)}`
    case ScanPhase.Pruning:
      return 'Tidying up…'
  }
}
