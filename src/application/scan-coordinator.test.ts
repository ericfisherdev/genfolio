import { describe, expect, it } from 'vitest'
import type { LibraryRoot, RootId } from '@domain/library'
import { ScanPhase } from '@domain/scan'
import { ScanEventType, type ScanEvent, type ScanReport } from '@shared/scan'
import { ScanCoordinator, type RootScanner } from './scan-coordinator'

const root: LibraryRoot = { id: 1 as RootId, path: '/lib', addedAt: 0 }
const report: ScanReport = { added: 2, updated: 0, unchanged: 0, removed: 0, failed: 0 }

/** A scanner whose run finishes only when the test says so; it records each run's scope. */
function controllableScanner(): RootScanner & {
  finish(): void
  fail(error: Error): void
  scopes: (readonly string[] | undefined)[]
} {
  let resolve: (report: ScanReport) => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const scopes: (readonly string[] | undefined)[] = []
  return {
    scopes,
    run: (_root, signal, onProgress, scope) =>
      new Promise<ScanReport>((res, rej) => {
        scopes.push(scope)
        onProgress({ rootId: root.id, phase: ScanPhase.Walking, done: 1, total: undefined })
        resolve = res
        reject = rej
        signal.addEventListener('abort', () => rej(signal.reason))
      }),
    finish: () => resolve(report),
    fail: (error) => reject(error)
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('ScanCoordinator', () => {
  it('emits progress then finished, and is idle afterwards', async () => {
    const scanner = controllableScanner()
    const events: ScanEvent[] = []
    const coordinator = new ScanCoordinator(scanner, (event) => events.push(event))

    expect(coordinator.start(root)).toBe(true)
    expect(coordinator.isScanning(root.id)).toBe(true)
    scanner.finish()
    await flush()

    expect(events).toEqual([
      { type: ScanEventType.Progress, rootId: 1, phase: ScanPhase.Walking, done: 1, total: null },
      { type: ScanEventType.Finished, rootId: 1, report }
    ])
    expect(coordinator.isScanning(root.id)).toBe(false)
  })

  it('refuses a second scan of the same root while one runs', () => {
    const coordinator = new ScanCoordinator(controllableScanner(), () => undefined)
    expect(coordinator.start(root)).toBe(true)
    expect(coordinator.start(root)).toBe(false)
  })

  it('emits failed with the reason when the scan errors', async () => {
    const scanner = controllableScanner()
    const events: ScanEvent[] = []
    new ScanCoordinator(scanner, (event) => events.push(event)).start(root)
    scanner.fail(new Error('disk gone'))
    await flush()
    expect(events.at(-1)).toEqual({ type: ScanEventType.Failed, rootId: 1, reason: 'disk gone' })
  })

  it('cancel waits for the scan to stop and emits nothing further', async () => {
    const events: ScanEvent[] = []
    const coordinator = new ScanCoordinator(controllableScanner(), (event) => events.push(event))
    coordinator.start(root)
    await coordinator.cancel(root.id)
    expect(coordinator.isScanning(root.id)).toBe(false)
    expect(events.map((event) => event.type)).toEqual([ScanEventType.Progress])
  })

  it('queues folder refreshes behind a running scan and merges them', async () => {
    const scanner = controllableScanner()
    const coordinator = new ScanCoordinator(scanner, () => undefined)
    coordinator.refresh(root, ['a'])
    coordinator.refresh(root, ['b'])
    coordinator.refresh(root, ['a', 'c'])
    expect(scanner.scopes).toEqual([['a']])
    scanner.finish()
    await flush()
    expect(scanner.scopes).toEqual([['a'], ['b', 'a', 'c']])
    scanner.finish()
    await flush()
    expect(coordinator.isScanning(root.id)).toBe(false)
  })

  it('drops queued refreshes when the root is cancelled', async () => {
    const scanner = controllableScanner()
    const coordinator = new ScanCoordinator(scanner, () => undefined)
    coordinator.start(root)
    coordinator.refresh(root, ['a'])
    await coordinator.cancel(root.id)
    await flush()
    expect(scanner.scopes).toEqual([undefined])
    expect(coordinator.isScanning(root.id)).toBe(false)
  })
})
