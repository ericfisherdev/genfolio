import type { GenfolioApi } from '@shared/genfolio-api'
import type { ScanEvent } from '@shared/scan'
import { ScanEventType } from '@shared/scan-kinds'
import type { ScanProgressView } from '../format/scan-progress-text'

/** A copy of `record` without `key`. */
function without<V>(record: Readonly<Record<number, V>>, key: number): Record<number, V> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => Number(k) !== key))
}

/** Live progress of running scans, keyed by root id; finished or failed scans drop out. */
export class ScanProgressState {
  active: Readonly<Record<number, ScanProgressView>> = $state({})
  /** Last failure reason per root, shown until the next scan of that root starts. */
  failures: Readonly<Record<number, string>> = $state({})
  private readonly unsubscribe: () => void

  constructor(
    api: Pick<GenfolioApi, 'onScanEvent'>,
    private readonly onScanEnded: (rootId: number) => void
  ) {
    this.unsubscribe = api.onScanEvent((event) => this.handle(event))
  }

  get isScanning(): boolean {
    return Object.keys(this.active).length > 0
  }

  dispose(): void {
    this.unsubscribe()
  }

  private handle(event: ScanEvent): void {
    const others = without(this.active, event.rootId)
    const otherFailures = without(this.failures, event.rootId)
    switch (event.type) {
      case ScanEventType.Progress:
        this.active = { ...others, [event.rootId]: event }
        this.failures = otherFailures
        return
      case ScanEventType.Finished:
        this.active = others
        this.onScanEnded(event.rootId)
        return
      case ScanEventType.Failed:
        this.active = others
        this.failures = { ...otherFailures, [event.rootId]: event.reason }
        this.onScanEnded(event.rootId)
        return
    }
  }
}
