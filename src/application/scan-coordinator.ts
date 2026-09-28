import type { LibraryRoot, RootId } from '@domain/library'
import type { ScanProgress } from '@domain/scan'
import { ScanEventType, type ScanEvent, type ScanReport } from '@shared/scan'

export interface RootScanner {
  run(
    root: LibraryRoot,
    signal: AbortSignal,
    onProgress: (progress: ScanProgress) => void
  ): Promise<ScanReport>
}

interface RunningScan {
  readonly controller: AbortController
  readonly done: Promise<void>
}

/**
 * Runs at most one scan per root in the background and reports its lifecycle as
 * {@link ScanEvent}s. A cancelled scan emits nothing further.
 */
export class ScanCoordinator {
  private readonly running = new Map<RootId, RunningScan>()

  constructor(
    private readonly scanner: RootScanner,
    private readonly emit: (event: ScanEvent) => void
  ) {}

  isScanning(rootId: RootId): boolean {
    return this.running.has(rootId)
  }

  /** Starts a scan; returns false when one is already running for this root. */
  start(root: LibraryRoot): boolean {
    if (this.running.has(root.id)) return false
    const controller = new AbortController()
    const done = this.scanner
      .run(root, controller.signal, (progress) =>
        this.emit({ type: ScanEventType.Progress, ...progress, total: progress.total ?? null })
      )
      .then((report) => this.emit({ type: ScanEventType.Finished, rootId: root.id, report }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const reason = error instanceof Error ? error.message : String(error)
        this.emit({ type: ScanEventType.Failed, rootId: root.id, reason })
      })
      .finally(() => this.running.delete(root.id))
    this.running.set(root.id, { controller, done })
    return true
  }

  /** Aborts a running scan and resolves once it has stopped; resolves at once when idle. */
  async cancel(rootId: RootId): Promise<void> {
    const scan = this.running.get(rootId)
    if (!scan) return
    scan.controller.abort()
    await scan.done
  }
}
