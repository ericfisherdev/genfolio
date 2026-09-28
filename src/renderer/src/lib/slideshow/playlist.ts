/** mulberry32: a small seeded generator, so a shuffle can be reproduced in tests. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates with the seeded generator. */
function shuffled(ids: readonly number[], random: () => number): number[] {
  const order = [...ids]
  for (let index = order.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[order[index], order[swap]] = [order[swap] as number, order[index] as number]
  }
  return order
}

export interface PlaylistOptions {
  /** Shown first; the first image when absent or not among the ids. */
  readonly startId?: number
  readonly shuffle: boolean
  readonly loop: boolean
  readonly seed: number
}

/**
 * The order a slideshow shows images in. In order, or shuffled with a seed: every image
 * shows once per round (no repeats until all have shown). With `loop`, a new round starts
 * after the last image; a new shuffled round never begins with the image that just showed.
 * Stepping back walks the images already shown.
 */
export class Playlist {
  private readonly shown: number[] = []
  private position = 0
  private readonly random: () => number

  constructor(
    private readonly ids: readonly number[],
    private readonly options: PlaylistOptions
  ) {
    this.random = seeded(options.seed)
    const start =
      options.startId !== undefined && ids.includes(options.startId) ? options.startId : ids[0]
    if (start === undefined) return
    const rest = options.shuffle
      ? shuffled(ids, this.random).filter((id) => id !== start)
      : this.after(start, options.loop)
    this.shown.push(start, ...rest)
  }

  get current(): number | undefined {
    return this.shown[this.position]
  }

  /** Whether `next` would stop: the last image without looping. */
  get atEnd(): boolean {
    return !this.options.loop && this.position >= this.shown.length - 1
  }

  /** Moves on and returns the new image; stays on the last one at the end of a non-loop. */
  next(): number | undefined {
    if (this.position < this.shown.length - 1) this.position++
    else if (this.options.loop && this.ids.length > 0) {
      this.appendRound()
      this.position++
    }
    return this.current
  }

  /** Moves back through what was shown; stays on the first. */
  previous(): number | undefined {
    if (this.position > 0) this.position--
    return this.current
  }

  /** In order, the ids after `id`; wrapping round to just before it when looping. */
  private after(id: number, wrap: boolean): number[] {
    const at = this.ids.indexOf(id)
    const tail = this.ids.slice(at + 1)
    return wrap ? [...tail, ...this.ids.slice(0, at)] : tail
  }

  /** One more round of every image, continuing from the last one shown. */
  private appendRound(): void {
    const last = this.shown.at(-1) as number
    if (!this.options.shuffle) {
      this.shown.push(...this.after(last, true), last)
      return
    }
    const order = shuffled(this.ids, this.random)
    // A shuffled round never starts with the image that just showed.
    if (order.length > 1 && order[0] === last) {
      ;[order[0], order[1]] = [order[1] as number, order[0] as number]
    }
    this.shown.push(...order)
  }
}
