import type { GenfolioApi } from '@shared/genfolio-api'
import type { ScanEvent } from '@shared/scan'
import { ScanEventType } from '@shared/scan-kinds'
import type { ScanProgressView } from '../format/scan-progress-text'

/** A copy of `record` without `key`. */
function without<V>(record: Readonly<Record<number, V>>, key: number): Record<number, V> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => Number(k) !== key))
}

/** `record` limited to `keep`, or undefined when nothing would be removed. */
function keepOnly<V>(
  record: Readonly<Record<number, V>>,
  keep: readonly number[]
): Record<number, V> | undefined {
  const entries = Object.entries(record)
  const kept = entries.filter(([key]) => keep.includes(Number(key)))
  return kept.length === entries.length ? undefined : Object.fromEntries(kept)
}

/** Live progress of running scans, keyed by root id; finished or failed scans drop out. */
export class ScanProgressState {
  active: Readonly<Record<number, ScanProgressView>> = $state({})
  /** Last failure reason per root, shown until the next scan of that root starts. */
  failures: Readonly<Record<number, string>> = $state({})
  /** Roots that can't be watched for changes (rescanned periodically instead). */
  unwatched: readonly number[] = $state.raw([])
  /** Background hashing for look-alikes while it runs. */
  hashing: { readonly done: number; readonly total: number } | undefined = $state()
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

  /**
   * Drops entries for roots no longer in the library. A cancelled scan (root removed or
   * merged into a parent) emits no end event, so this is the only way its entry leaves.
   */
  retain(rootIds: Iterable<number>): void {
    const keep = [...rootIds]
    const active = keepOnly(this.active, keep)
    if (active) this.active = active
    const failures = keepOnly(this.failures, keep)
    if (failures) this.failures = failures
  }

  private handle(event: ScanEvent): void {
    if (event.type === ScanEventType.WatchUnavailable) {
      if (!this.unwatched.includes(event.rootId)) this.unwatched = [...this.unwatched, event.rootId]
      return
    }
    if (event.type === ScanEventType.Hashing) {
      this.hashing = event.done < event.total ? { done: event.done, total: event.total } : undefined
      return
    }
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
