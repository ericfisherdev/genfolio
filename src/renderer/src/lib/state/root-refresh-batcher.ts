export interface RootRefreshBatcherOptions {
  /** Roots reported within this long of each other are refreshed together. */
  readonly delayMs: number
  /** A steady stream of reports still refreshes at least this often. */
  readonly maxWaitMs: number
}

export const DEFAULT_ROOT_REFRESH_OPTIONS: RootRefreshBatcherOptions = {
  delayMs: 150,
  maxWaitMs: 1000
}

/**
 * Collects the roots whose scans ended and refreshes them once things pause: scans of a
 * folder Fooocus keeps writing to end one after another, and each would reload the library
 * and everything that follows it.
 */
export class RootRefreshBatcher {
  private readonly pending = new Set<number>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private firstAt = 0

  constructor(
    private readonly refresh: (rootIds: ReadonlySet<number>) => void,
    private readonly options: RootRefreshBatcherOptions = DEFAULT_ROOT_REFRESH_OPTIONS,
    private readonly now: () => number = () => Date.now()
  ) {}

  add(rootId: number): void {
    if (this.pending.size === 0) this.firstAt = this.now()
    this.pending.add(rootId)
    if (this.timer !== undefined) clearTimeout(this.timer)
    const waited = this.now() - this.firstAt
    const wait = Math.max(0, Math.min(this.options.delayMs, this.options.maxWaitMs - waited))
    this.timer = setTimeout(() => this.flush(), wait)
  }

  private flush(): void {
    this.timer = undefined
    const rootIds = new Set(this.pending)
    this.pending.clear()
    this.refresh(rootIds)
  }
}
