import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SlideshowSettings } from '@shared/slideshow'
import { Slideshow, type Timer } from './slideshow.svelte'

const timer: Timer = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
}

let settings: SlideshowSettings

beforeEach(() => {
  vi.useFakeTimers()
  settings = { intervalMs: 3_000, shuffle: false, loop: false, showPrompt: false }
})

afterEach(() => {
  vi.useRealTimers()
})

function slideshow(preload: (id: number) => Promise<void> = async () => undefined): Slideshow {
  return new Slideshow(
    timer,
    preload,
    () => 7,
    () => settings
  )
}

describe('Slideshow', () => {
  it('shows the next image after the interval and stops on the last without loop', async () => {
    const show = slideshow()
    show.start([1, 2, 3], 2)
    await vi.advanceTimersByTimeAsync(0)
    expect(show.currentId).toBe(2)
    await vi.advanceTimersByTimeAsync(2_999)
    expect(show.currentId).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(show.currentId).toBe(3)
    expect(show.playing).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(show.currentId).toBe(3)
  })

  it('decodes the next image before showing it', async () => {
    let release: () => void = () => undefined
    const preload = vi.fn((id: number) =>
      id === 2 ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve()
    )
    const show = slideshow(preload)
    show.start([1, 2], 1)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(preload).toHaveBeenCalledWith(2)
    expect(show.currentId).toBe(1)
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(show.currentId).toBe(2)
  })

  it('pauses and resumes, and steps by hand, restarting the countdown', async () => {
    settings = { ...settings, loop: true }
    const show = slideshow()
    show.start([1, 2, 3], 1)
    await vi.advanceTimersByTimeAsync(0)
    show.togglePlaying()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(show.currentId).toBe(1)
    show.next()
    await vi.advanceTimersByTimeAsync(0)
    expect(show.currentId).toBe(2)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(show.currentId).toBe(2)
    show.togglePlaying()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(show.currentId).toBe(3)
    show.previous()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(show.currentId).toBe(2)
  })

  it('drops a slow decode that a later step overtook', async () => {
    let releaseTwo: () => void = () => undefined
    const preload = vi.fn((id: number) =>
      id === 2 ? new Promise<void>((resolve) => (releaseTwo = resolve)) : Promise.resolve()
    )
    const show = slideshow(preload)
    show.start([1, 2, 3], 1)
    await vi.advanceTimersByTimeAsync(0)
    show.next()
    show.next()
    await vi.advanceTimersByTimeAsync(0)
    expect(show.currentId).toBe(3)
    releaseTwo()
    await vi.advanceTimersByTimeAsync(0)
    expect(show.currentId).toBe(3)
  })

  it('stops the countdown when stopped', async () => {
    settings = { ...settings, loop: true }
    const show = slideshow()
    show.start([1, 2], 1)
    await vi.advanceTimersByTimeAsync(0)
    show.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(show.currentId).toBe(1)
  })
})
