import type { SlideshowSettings } from '@shared/slideshow'
import { Playlist } from './playlist'

/** Scheduling, injectable so tests can use fake timers. */
export interface Timer {
  set(callback: () => void, ms: number): unknown
  clear(handle: unknown): void
}

/** Loads and decodes an image before it is shown; resolves even when decoding fails. */
export type Preload = (imageId: number) => Promise<void>

/**
 * A running slideshow over a set of image ids. Each change of image first decodes the next
 * one, so it never flashes in half-loaded; the timer restarts whenever the image changes.
 * Stops on the last image unless looping.
 */
export class Slideshow {
  currentId: number | undefined = $state()
  playing = $state(true)
  private playlist: Playlist | undefined
  private timer: unknown
  /** Bumped on every change, so a slow decode for an older step doesn't land late. */
  private step = 0

  constructor(
    private readonly clock: Timer,
    private readonly preload: Preload,
    private readonly seed: () => number,
    private readonly settings: () => SlideshowSettings
  ) {}

  start(ids: readonly number[], startId: number | undefined): void {
    const settings = this.settings()
    this.playlist = new Playlist(ids, {
      ...(startId !== undefined ? { startId } : {}),
      shuffle: settings.shuffle,
      loop: settings.loop,
      seed: this.seed()
    })
    this.playing = true
    void this.show(this.playlist.current)
  }

  /** Rebuilds the order from the current image, as after changing shuffle or loop. */
  restart(ids: readonly number[]): void {
    this.start(ids, this.currentId)
  }

  next(): void {
    void this.show(this.playlist?.next())
  }

  previous(): void {
    void this.show(this.playlist?.previous())
  }

  togglePlaying(): void {
    this.playing = !this.playing
    if (this.playing) this.schedule()
    else this.clearTimer()
  }

  /** Restarts the countdown, as after the interval changed. */
  reschedule(): void {
    this.schedule()
  }

  stop(): void {
    this.clearTimer()
    this.step++
  }

  private async show(imageId: number | undefined): Promise<void> {
    this.clearTimer()
    const step = ++this.step
    if (imageId === undefined) return
    if (imageId !== this.currentId) await this.preload(imageId)
    if (step !== this.step) return
    this.currentId = imageId
    this.schedule()
  }

  private schedule(): void {
    this.clearTimer()
    if (!this.playing) return
    if (this.playlist?.atEnd) {
      this.playing = false
      return
    }
    this.timer = this.clock.set(() => this.next(), this.settings().intervalMs)
  }

  private clearTimer(): void {
    if (this.timer !== undefined) this.clock.clear(this.timer)
    this.timer = undefined
  }
}
