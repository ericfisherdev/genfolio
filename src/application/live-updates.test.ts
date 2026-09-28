import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { FileWatcher, WatchedChange } from '@domain/file-watcher'
import type { LibraryRoot, RootId } from '@domain/library'
import { LiveUpdates, type LiveUpdateTargets } from './live-updates'

const root = (id: number): LibraryRoot => ({ id: id as RootId, path: `/lib/${id}`, addedAt: 1 })

interface FakeWatch {
  readonly change: (change: WatchedChange) => void
  readonly fail: (error: unknown) => void
  closed: boolean
}

/** A watcher the test drives through each watch's `change` and `fail`. */
function fakeWatcher(): { watcher: FileWatcher; watches: Map<string, FakeWatch> } {
  const watches = new Map<string, FakeWatch>()
  const watcher: FileWatcher = {
    watch: (path, change, fail) => {
      const entry: FakeWatch = { change, fail, closed: false }
      watches.set(path, entry)
      return { close: async () => void (entry.closed = true) }
    }
  }
  return { watcher, watches }
}

function targets(): { [K in keyof LiveUpdateTargets]: Mock<LiveUpdateTargets[K]> } {
  return {
    refresh: vi.fn<LiveUpdateTargets['refresh']>(),
    rescan: vi.fn<LiveUpdateTargets['rescan']>(),
    watchUnavailable: vi.fn<LiveUpdateTargets['watchUnavailable']>()
  }
}

const scheduler = {
  setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (callback: () => void, ms: number) => setInterval(callback, ms),
  clearInterval: (handle: unknown) => clearInterval(handle as ReturnType<typeof setInterval>)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('LiveUpdates', () => {
  it('scans the changed folders together once changes pause', async () => {
    const { watcher, watches } = fakeWatcher()
    const to = targets()
    const live = new LiveUpdates(watcher, to, scheduler, {
      debounceMs: 300,
      fallbackRescanMs: 1000
    })
    await live.sync([root(1)])
    const watch = watches.get('/lib/1')
    watch?.change({ relDir: 'a' })
    await vi.advanceTimersByTimeAsync(200)
    watch?.change({ relDir: 'b' })
    watch?.change({ relDir: 'a' })
    await vi.advanceTimersByTimeAsync(299)
    expect(to.refresh).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(to.refresh).toHaveBeenCalledWith(1, ['a', 'b'])
  })

  it('rescans a root it cannot watch periodically and says so once', async () => {
    const { watcher, watches } = fakeWatcher()
    const to = targets()
    const live = new LiveUpdates(watcher, to, scheduler, {
      debounceMs: 300,
      fallbackRescanMs: 1000
    })
    await live.sync([root(1)])
    watches.get('/lib/1')?.fail(Object.assign(new Error('limit'), { code: 'ENOSPC' }))
    watches.get('/lib/1')?.fail(new Error('again'))
    expect(to.watchUnavailable).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2500)
    expect(to.rescan).toHaveBeenCalledTimes(2)
    await live.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(to.rescan).toHaveBeenCalledTimes(2)
  })

  it('follows the root list: new roots start, removed roots stop', async () => {
    const { watcher, watches } = fakeWatcher()
    const to = targets()
    const live = new LiveUpdates(watcher, to, scheduler)
    await live.sync([root(1), root(2)])
    await live.sync([root(2), root(3)])
    expect(watches.get('/lib/1')?.closed).toBe(true)
    expect(watches.get('/lib/2')?.closed).toBe(false)
    expect(watches.has('/lib/3')).toBe(true)
  })
})
