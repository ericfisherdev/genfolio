/** Runs at most `limit` tasks at once; later ones wait in FIFO order. */
export class ConcurrencyLimiter {
  private running = 0
  private readonly waiting: (() => void)[] = []

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      // A finishing task hands its slot straight to us, so `running` does not change.
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    } else {
      this.running++
    }
    try {
      return await task()
    } finally {
      const next = this.waiting.shift()
      if (next) next()
      else this.running--
    }
  }
}
