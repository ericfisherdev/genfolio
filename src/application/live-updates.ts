import type { FileWatcher, WatchSubscription } from '@domain/file-watcher'
import type { LibraryRoot, RootId } from '@domain/library'

/** Scheduling, injectable so tests can use fake timers. */
export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  setInterval(callback: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

export interface LiveUpdateTargets {
  /** Scans these folders of the root. */
  refresh(rootId: RootId, dirs: Iterable<string>): void
  /** Scans the whole root. */
  rescan(rootId: RootId): void
  /** The root can't be watched; it is rescanned periodically instead. Sent once per root. */
  watchUnavailable(rootId: RootId): void
}

export interface LiveUpdateOptions {
  /** Changes arriving within this window are scanned together. */
  readonly debounceMs: number
  /** How often a root that can't be watched is rescanned. */
  readonly fallbackRescanMs: number
}

export const DEFAULT_LIVE_OPTIONS: LiveUpdateOptions = {
  debounceMs: 300,
  fallbackRescanMs: 10 * 60_000
}

interface Watched {
  subscription: WatchSubscription | undefined
  pending: Set<string>
  timer: unknown
  fallback: unknown
}

/**
 * Keeps the library in step with the disk while the app runs: each root is watched, changed
 * folders are collected for a short while and scanned together. A root whose watch fails
 * (such as the system's inotify limit) is rescanned periodically instead.
 */
export class LiveUpdates {
  private readonly watched = new Map<RootId, Watched>()

  constructor(
    private readonly watcher: FileWatcher,
    private readonly targets: LiveUpdateTargets,
    private readonly scheduler: Scheduler,
    private readonly options: LiveUpdateOptions = DEFAULT_LIVE_OPTIONS
  ) {}

  /** Watches exactly these roots: new ones start, removed ones stop. */
  async sync(roots: readonly LibraryRoot[]): Promise<void> {
    const wanted = new Set(roots.map((root) => root.id))
    for (const rootId of [...this.watched.keys()]) {
      if (!wanted.has(rootId)) await this.unwatch(rootId)
    }
    for (const root of roots) if (!this.watched.has(root.id)) this.watch(root)
  }

  async stop(): Promise<void> {
    for (const rootId of [...this.watched.keys()]) await this.unwatch(rootId)
  }

  private watch(root: LibraryRoot): void {
    const entry: Watched = {
      subscription: undefined,
      pending: new Set(),
      timer: undefined,
      fallback: undefined
    }
    this.watched.set(root.id, entry)
    entry.subscription = this.watcher.watch(
      root.path,
      (change) => this.changed(root.id, entry, change.relDir),
      () => this.fallBack(root.id, entry)
    )
  }

  private changed(rootId: RootId, entry: Watched, relDir: string): void {
    entry.pending.add(relDir)
    if (entry.timer !== undefined) this.scheduler.clearTimeout(entry.timer)
    entry.timer = this.scheduler.setTimeout(() => {
      entry.timer = undefined
      const dirs = [...entry.pending]
      entry.pending.clear()
      this.targets.refresh(rootId, dirs)
    }, this.options.debounceMs)
  }

  private fallBack(rootId: RootId, entry: Watched): void {
    entry.subscription = undefined
    if (entry.fallback !== undefined) return
    this.targets.watchUnavailable(rootId)
    entry.fallback = this.scheduler.setInterval(
      () => this.targets.rescan(rootId),
      this.options.fallbackRescanMs
    )
  }

  private async unwatch(rootId: RootId): Promise<void> {
    const entry = this.watched.get(rootId)
    if (!entry) return
    this.watched.delete(rootId)
    if (entry.timer !== undefined) this.scheduler.clearTimeout(entry.timer)
    if (entry.fallback !== undefined) this.scheduler.clearInterval(entry.fallback)
    await entry.subscription?.close()
  }
}
