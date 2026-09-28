import { describe, expect, it, vi } from 'vitest'
import { AddRootOutcome } from '@shared/library-kinds'
import { ScanEventType, ScanPhase } from '@shared/scan-kinds'
import { RouteKind } from '../routing/route'
import { RouterState } from '../routing/router.svelte'
import { memoryHash, memoryStore, sampleLibrary, testServices } from '../testing/app-services'
import { ScanProgressState } from './scan-progress.svelte'
import { SortPreference } from './sort-preference.svelte'
import type { ScanEvent } from '@shared/scan'
import { SortOrder } from '@shared/gallery-kinds'

describe('RouterState', () => {
  it('reads the initial hash, writes on navigate and follows hash changes', () => {
    const hash = memoryHash('#/dir/4?recursive=0')
    const router = new RouterState(hash)
    expect(router.route).toEqual({ kind: RouteKind.Directory, directoryId: 4, recursive: false })

    router.navigate({ kind: RouteKind.Image, imageId: 9 })
    expect(hash.current).toBe('#/image/9')

    hash.change('#/')
    expect(router.route).toEqual({ kind: RouteKind.All })
  })
})

describe('LibraryState', () => {
  it('loads roots and trees and totals the images', async () => {
    const { services } = testServices(sampleLibrary())
    await services.library.refresh()
    expect(services.library.loaded).toBe(true)
    expect(services.library.totalImages).toBe(8)
    expect(services.library.trees[1]?.children).toHaveLength(2)
  })

  it('refreshes after an add and keeps a notice for rejected adds', async () => {
    const addRootViaDialog = vi
      .fn()
      .mockResolvedValueOnce({ outcome: AddRootOutcome.InsideExistingRoot, path: '/lib' })
    const listRoots = vi.fn(async () => [])
    const { services } = testServices(sampleLibrary(), { addRootViaDialog, listRoots })
    await services.library.addFolder()
    expect(services.library.notice).toBe('That folder is already included in /lib.')
    expect(listRoots).not.toHaveBeenCalled()
    services.library.dismissNotice()
    expect(services.library.notice).toBeUndefined()
  })
})

describe('ScanProgressState', () => {
  it('shows background hashing until the pass ends, without counting it as a scan', () => {
    let listener: (event: ScanEvent) => void = () => undefined
    const scans = new ScanProgressState(
      {
        onScanEvent: (subscriber) => {
          listener = subscriber
          return () => undefined
        }
      },
      vi.fn()
    )
    listener({ type: ScanEventType.Hashing, done: 3, total: 10 })
    expect(scans.hashing).toEqual({ done: 3, total: 10 })
    expect(scans.isScanning).toBe(false)
    listener({ type: ScanEventType.Hashing, done: 10, total: 10 })
    expect(scans.hashing).toBeUndefined()
  })

  it('tracks progress per root, records failures and reports scan ends', () => {
    const ended = vi.fn()
    let listener: (event: ScanEvent) => void = () => undefined
    const scans = new ScanProgressState(
      {
        onScanEvent: (subscriber) => {
          listener = subscriber
          return () => undefined
        }
      },
      ended
    )

    listener({
      type: ScanEventType.Progress,
      rootId: 1,
      phase: ScanPhase.Indexing,
      done: 5,
      total: 9
    })
    expect(scans.isScanning).toBe(true)
    expect(scans.active[1]).toMatchObject({ done: 5, total: 9 })

    listener({ type: ScanEventType.Failed, rootId: 1, reason: 'disk gone' })
    expect(scans.isScanning).toBe(false)
    expect(scans.failures[1]).toBe('disk gone')
    expect(ended).toHaveBeenCalledWith(1)

    listener({
      type: ScanEventType.Progress,
      rootId: 1,
      phase: ScanPhase.Walking,
      done: 1,
      total: null
    })
    expect(scans.failures[1]).toBeUndefined()
  })
})

describe('ScanProgressState.retain', () => {
  it('forgets progress and failures of roots that are gone', () => {
    let listener: (event: ScanEvent) => void = () => undefined
    const scans = new ScanProgressState(
      {
        onScanEvent: (subscriber) => {
          listener = subscriber
          return () => undefined
        }
      },
      () => undefined
    )
    listener({
      type: ScanEventType.Progress,
      rootId: 1,
      phase: ScanPhase.Indexing,
      done: 1,
      total: 9
    })
    listener({ type: ScanEventType.Failed, rootId: 2, reason: 'gone' })
    scans.retain([3])
    expect(scans.isScanning).toBe(false)
    expect(scans.active[1]).toBeUndefined()
    expect(scans.failures[2]).toBeUndefined()
  })
})

describe('LibraryState failures', () => {
  it('records a failed load instead of rejecting, and clears it on success', async () => {
    const listRoots = vi
      .fn()
      .mockRejectedValueOnce(new Error('service unavailable'))
      .mockResolvedValueOnce([])
    const { services } = testServices(sampleLibrary(), { listRoots })
    await expect(services.library.refresh()).resolves.toBeUndefined()
    expect(services.library.loadError).toBe('service unavailable')
    expect(services.library.loaded).toBe(false)
    await services.library.refresh()
    expect(services.library.loadError).toBeUndefined()
    expect(services.library.loaded).toBe(true)
  })

  it('reports a failed refresh after the library has loaded as a notice', async () => {
    const listRoots = vi
      .fn()
      .mockResolvedValueOnce(sampleLibrary().roots)
      .mockRejectedValueOnce(new Error('timed out'))
    const { services } = testServices(sampleLibrary(), { listRoots })
    await services.library.refresh()
    await services.library.refresh()
    expect(services.library.loaded).toBe(true)
    expect(services.library.notice).toBe('Could not refresh the library: timed out')
  })

  it('reports file actions that fail or find no file', async () => {
    const { services } = testServices(sampleLibrary())
    await services.library.fileAction('copy the path', async () => true)
    expect(services.library.notice).toBeUndefined()
    await services.library.fileAction('copy the path', async () => false)
    expect(services.library.notice).toBe('Could not copy the path: the file is no longer there.')
    await services.library.fileAction('show the file', () => Promise.reject(new Error('timed out')))
    expect(services.library.notice).toBe('Could not show the file: timed out')
  })

  it('turns failed actions into notices', async () => {
    const boom = (): Promise<never> => Promise.reject(new Error('timed out'))
    const { services } = testServices(sampleLibrary(), {
      removeRoot: boom,
      rescanRoot: boom,
      addRootViaDialog: boom
    })
    await expect(services.library.remove(1)).resolves.toBeUndefined()
    expect(services.library.notice).toBe('Could not remove the folder: timed out')
    await services.library.rescan(1)
    expect(services.library.notice).toBe('Could not rescan the folder: timed out')
    await expect(services.library.addFolder()).resolves.toBeUndefined()
    expect(services.library.notice).toBe('Could not add the folder: timed out')
  })

  it('ignores a refresh that finishes after a newer one', async () => {
    let releaseSlow: (roots: never[]) => void = () => undefined
    const listRoots = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (releaseSlow = resolve)))
      .mockImplementationOnce(async () => sampleLibrary().roots)
    const { services } = testServices(sampleLibrary(), { listRoots })
    const slow = services.library.refresh()
    await services.library.refresh()
    releaseSlow([])
    await slow
    expect(services.library.roots).toHaveLength(1)
  })
})

describe('SortPreference', () => {
  it('defaults to newest, restores a saved order and ignores unknown values', () => {
    expect(new SortPreference(memoryStore()).current).toBe(SortOrder.Newest)
    expect(new SortPreference(memoryStore({ 'genfolio.sort': 'file-name' })).current).toBe(
      SortOrder.FileName
    )
    expect(new SortPreference(memoryStore({ 'genfolio.sort': 'random' })).current).toBe(
      SortOrder.Newest
    )
  })

  it('persists changes and survives storage that throws', () => {
    const values: Record<string, string> = {}
    const sort = new SortPreference(memoryStore(values))
    sort.set(SortOrder.Oldest)
    expect(values['genfolio.sort']).toBe('oldest')

    const broken = new SortPreference({
      get: () => {
        throw new Error('SecurityError')
      },
      set: () => {
        throw new Error('QuotaExceededError')
      }
    })
    expect(() => broken.set(SortOrder.Oldest)).not.toThrow()
    expect(broken.current).toBe(SortOrder.Oldest)
  })

  it('keeps a separate album order, defaulting to album order, never used for the library', () => {
    const values: Record<string, string> = { 'genfolio.sort': 'album-order' }
    const sort = new SortPreference(memoryStore(values))
    expect(sort.current).toBe(SortOrder.Newest)
    expect(sort.album).toBe(SortOrder.AlbumOrder)
    sort.setAlbum(SortOrder.Rating)
    sort.set(SortOrder.AlbumOrder)
    expect(sort.current).toBe(SortOrder.Newest)
    expect(new SortPreference(memoryStore(values)).album).toBe(SortOrder.Rating)
  })
})
