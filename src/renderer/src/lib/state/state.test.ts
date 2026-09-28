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
})
