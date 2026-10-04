import type { LibraryRoot } from '@domain/library'

export interface LibraryStartupDependencies {
  readonly live: {
    sync(roots: readonly LibraryRoot[]): Promise<void>
    ready(): Promise<void>
  }
  readonly roots: {
    all(): LibraryRoot[]
    /** Resolves once the scans have ended. */
    reconcileAll(): Promise<void>
  }
  readonly hashing: { request(): void }
  /** Resolves after `ms`. */
  readonly wait: (ms: number) => Promise<void>
  /** A step failed; the sequence goes on with the next one. */
  readonly onFailure: (what: string, error: unknown) => void
}

export interface LibraryStartupOptions {
  /** How long to wait for the watchers before scanning anyway. */
  readonly watchReadyWaitMs: number
}

export const DEFAULT_STARTUP_OPTIONS: LibraryStartupOptions = { watchReadyWaitMs: 30_000 }

/**
 * Brings the library in step with the disk when the service starts, one traversal of the
 * folders after another instead of all at once: the watchers walk every root first (so the
 * scan walks folders the system has just read), then every root is scanned. The scan starts
 * only after the watchers are up, so a file written meanwhile is seen by one of them; the
 * wait is capped so a huge tree can't hold the scan back for long. Every finished scan already
 * requests hashing, so with several roots hashing can overlap the scans still running; the
 * request after the scans covers images an earlier session left unhashed when no scan
 * finished. A failing step is reported and the rest still run.
 */
export class LibraryStartup {
  constructor(
    private readonly deps: LibraryStartupDependencies,
    private readonly options: LibraryStartupOptions = DEFAULT_STARTUP_OPTIONS
  ) {}

  async run(): Promise<void> {
    await this.step('watching the library', async () => {
      await this.deps.live.sync(this.deps.roots.all())
      await Promise.race([this.deps.live.ready(), this.deps.wait(this.options.watchReadyWaitMs)])
    })
    await this.step('reconciling the library', () => this.deps.roots.reconcileAll())
    this.deps.hashing.request()
  }

  private async step(what: string, work: () => Promise<void>): Promise<void> {
    try {
      await work()
    } catch (error) {
      this.deps.onFailure(what, error)
    }
  }
}
