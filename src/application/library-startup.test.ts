import { describe, expect, it } from 'vitest'
import type { LibraryRoot, RootId } from '@domain/library'
import { LibraryStartup, type LibraryStartupDependencies } from './library-startup'

const roots: LibraryRoot[] = [{ id: 1 as RootId, path: '/lib', addedAt: 1 }]

interface Harness {
  readonly deps: LibraryStartupDependencies
  readonly calls: string[]
  readonly failures: [string, unknown][]
  finishWatching(): void
}

function harness(overrides: Partial<LibraryStartupDependencies> = {}): Harness {
  const calls: string[] = []
  const failures: [string, unknown][] = []
  let finishWatching: () => void = () => undefined
  const watching = new Promise<void>((resolve) => (finishWatching = resolve))
  const deps: LibraryStartupDependencies = {
    live: {
      sync: async (synced) => void calls.push(`watch ${synced.length} root`),
      ready: async () => {
        calls.push('wait for watchers')
        await watching
        calls.push('watchers ready')
      }
    },
    roots: {
      all: () => roots,
      reconcileAll: async () => void calls.push('reconcile')
    },
    hashing: { request: () => void calls.push('hash') },
    wait: () => new Promise(() => undefined),
    onFailure: (what, error) => failures.push([what, error]),
    ...overrides
  }
  return { deps, calls, failures, finishWatching: () => finishWatching() }
}

const turn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('LibraryStartup', () => {
  it('watches, then scans, then hashes, each only after the one before', async () => {
    const { deps, calls, finishWatching } = harness()
    const run = new LibraryStartup(deps).run()
    await turn()
    expect(calls).toEqual(['watch 1 root', 'wait for watchers'])

    finishWatching()
    await run
    expect(calls).toEqual([
      'watch 1 root',
      'wait for watchers',
      'watchers ready',
      'reconcile',
      'hash'
    ])
  })

  it('scans anyway once the wait for the watchers runs out', async () => {
    const { deps, calls } = harness({ wait: async () => undefined })
    await new LibraryStartup(deps, { watchReadyWaitMs: 5 }).run()
    expect(calls).toContain('reconcile')
    expect(calls.at(-1)).toBe('hash')
  })

  it('waits as long as the options say', async () => {
    const waited: number[] = []
    const { deps } = harness({
      wait: async (ms) => void waited.push(ms)
    })
    await new LibraryStartup(deps, { watchReadyWaitMs: 1234 }).run()
    expect(waited).toEqual([1234])
  })

  it('reports a failed step and still runs the rest', async () => {
    const boom = new Error('inotify')
    const { deps, calls, failures } = harness({
      live: {
        sync: async () => {
          throw boom
        },
        ready: async () => undefined
      }
    })
    await new LibraryStartup(deps).run()
    expect(failures).toEqual([['watching the library', boom]])
    expect(calls).toEqual(['reconcile', 'hash'])
  })

  it('hashes even when the scan failed', async () => {
    const boom = new Error('unreadable root')
    const { deps, calls, failures, finishWatching } = harness({
      roots: {
        all: () => roots,
        reconcileAll: async () => {
          throw boom
        }
      }
    })
    finishWatching()
    await new LibraryStartup(deps).run()
    expect(failures).toEqual([['reconciling the library', boom]])
    expect(calls.at(-1)).toBe('hash')
  })
})
