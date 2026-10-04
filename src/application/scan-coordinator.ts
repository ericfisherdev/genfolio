import type { LibraryRoot, RootId } from '@domain/library'
import type { ScanProgress, ScanScope } from '@domain/scan'
import { ScanEventType, type ScanEvent, type ScanReport } from '@shared/scan'

export interface RootScanner {
  run(
    root: LibraryRoot,
    signal: AbortSignal,
    onProgress: (progress: ScanProgress) => void,
    scope?: ScanScope
  ): Promise<ScanReport>
}

interface RunningScan {
  readonly controller: AbortController
  readonly done: Promise<void>
}

/** What to scan next for a root: everything, or these folders. */
type Queued = { readonly full: true } | { readonly full: false; readonly dirs: Set<string> }

/**
 * Runs at most one scan per root in the background and reports its lifecycle as
 * {@link ScanEvent}s. Refreshes of some folders (live changes) queue behind a running scan,
 * merging while they wait; a full scan covers them. A cancelled scan emits nothing further
 * and drops what was queued.
 */
export class ScanCoordinator {
  private readonly running = new Map<RootId, RunningScan>()
  private readonly queued = new Map<RootId, { root: LibraryRoot; next: Queued }>()

  constructor(
    private readonly scanner: RootScanner,
    private readonly emit: (event: ScanEvent) => void
  ) {}

  isScanning(rootId: RootId): boolean {
    return this.running.has(rootId)
  }

  /** Resolves once no scan is running or queued, including scans started in the meantime. */
  async whenIdle(): Promise<void> {
    while (this.running.size > 0) {
      await Promise.allSettled([...this.running.values()].map((scan) => scan.done))
    }
  }

  /** Starts a full scan; returns false when one is already running for this root. */
  start(root: LibraryRoot): boolean {
    if (this.running.has(root.id)) return false
    this.run(root, undefined)
    return true
  }

  /** Scans these folders of the root now, or after the scan that is running. */
  refresh(root: LibraryRoot, dirs: Iterable<string>): void {
    if (!this.running.has(root.id)) {
      this.run(root, [...new Set(dirs)])
      return
    }
    const waiting = this.queued.get(root.id)?.next
    if (waiting?.full) return
    const merged = new Set(waiting?.dirs)
    for (const dir of dirs) merged.add(dir)
    this.queued.set(root.id, { root, next: { full: false, dirs: merged } })
  }

  /** Aborts a running scan (and forgets queued ones); resolves once it has stopped. */
  async cancel(rootId: RootId): Promise<void> {
    this.queued.delete(rootId)
    const scan = this.running.get(rootId)
    if (!scan) return
    scan.controller.abort()
    await scan.done
  }

  private run(root: LibraryRoot, scope: ScanScope | undefined): void {
    const controller = new AbortController()
    const done = this.scanner
      .run(
        root,
        controller.signal,
        (progress) =>
          this.emit({ type: ScanEventType.Progress, ...progress, total: progress.total ?? null }),
        scope
      )
      .then((report) => this.emit({ type: ScanEventType.Finished, rootId: root.id, report }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const reason = error instanceof Error ? error.message : String(error)
        this.emit({ type: ScanEventType.Failed, rootId: root.id, reason })
      })
      .finally(() => {
        this.running.delete(root.id)
        this.startQueued(root.id)
      })
    this.running.set(root.id, { controller, done })
  }

  private startQueued(rootId: RootId): void {
    const queued = this.queued.get(rootId)
    if (!queued) return
    this.queued.delete(rootId)
    this.run(queued.root, queued.next.full ? undefined : [...queued.next.dirs])
  }
}
