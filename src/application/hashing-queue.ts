import type { ImageId } from '@domain/library'
import { ScanEventType, type ScanEvent } from '@shared/scan'
import type { HashIndexer } from './hash-indexer'

/**
 * Runs the hashing pass in the background, one at a time. A request while a pass runs
 * queues exactly one more, since the running pass may already have passed new images.
 * Reports progress as {@link ScanEventType.Hashing} events and hands each pass's hashed
 * ids to `onHashed`.
 */
export class HashingQueue {
  private running: { controller: AbortController; done: Promise<void> } | undefined
  private again = false

  constructor(
    private readonly indexer: Pick<HashIndexer, 'run'>,
    private readonly emit: (event: ScanEvent) => void,
    private readonly onHashed: (ids: readonly ImageId[]) => void,
    /** A pass that failed for another reason than being stopped (a database error). */
    private readonly onError: (error: unknown) => void
  ) {}

  request(): void {
    if (this.running) this.again = true
    else this.start()
  }

  /** Stops the pass in progress and forgets a queued one. */
  async stop(): Promise<void> {
    this.again = false
    const running = this.running
    if (!running) return
    running.controller.abort()
    await running.done
  }

  private start(): void {
    const controller = new AbortController()
    const done = this.indexer
      .run(controller.signal, (hashed, total) =>
        this.emit({ type: ScanEventType.Hashing, done: hashed, total })
      )
      .then((ids) => {
        if (ids.length > 0) this.onHashed(ids)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) this.onError(error)
      })
      .finally(() => {
        this.running = undefined
        if (this.again) {
          this.again = false
          this.start()
        }
      })
    this.running = { controller, done }
  }
}
