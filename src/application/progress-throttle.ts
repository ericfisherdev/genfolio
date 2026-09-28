/** Forwards at most one update per `intervalMs`, plus any update marked final. */
export class ProgressThrottle<T> {
  private lastEmitted = Number.NEGATIVE_INFINITY

  constructor(
    private readonly emit: (update: T) => void,
    private readonly intervalMs: number,
    private readonly now: () => number
  ) {}

  report(update: T, final = false): void {
    const time = this.now()
    if (!final && time - this.lastEmitted < this.intervalMs) return
    this.lastEmitted = time
    this.emit(update)
  }
}
