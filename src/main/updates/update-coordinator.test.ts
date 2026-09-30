import type { MessageBoxOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { InstallMethod, UpdatePhase } from '@shared/update-kinds'
import type { UpdateEvent, UpdateProgress } from '@shared/updates'
import { messageOf, type ShowMessageBox, UpdateCoordinator } from './update-coordinator'
import { type AvailableUpdate, DownloadCancelledError, type UpdateSource } from './update-source'

const UPDATE: AvailableUpdate = {
  version: '0.2.0',
  releaseDate: '2026-10-01T00:00:00.000Z',
  notes: 'Copy for Fooocus.'
}
const RELEASES = 'https://example.test/releases'

/** An UpdateSource whose behaviour each test sets; download reports the given progress steps. */
function fakeSource(
  overrides: Partial<UpdateSource> = {},
  progress: readonly UpdateProgress[] = []
): UpdateSource {
  return {
    check: async () => UPDATE,
    download: async (onProgress) => {
      for (const step of progress) onProgress(step)
    },
    cancelDownload: vi.fn(),
    install: vi.fn(),
    ...overrides
  }
}

/** Answers each dialog in turn by the label of the button to press. */
function answering(labels: readonly string[]): ShowMessageBox & { shown: MessageBoxOptions[] } {
  const shown: MessageBoxOptions[] = []
  const show = async (options: MessageBoxOptions): ReturnType<ShowMessageBox> => {
    shown.push(options)
    const label = labels[shown.length - 1]
    const response = options.buttons?.indexOf(label ?? '') ?? -1
    if (response < 0) throw new Error(`no answer for dialog "${options.message}"`)
    return { response, checkboxChecked: false }
  }
  return Object.assign(show, { shown })
}

function coordinator(
  source: UpdateSource,
  show: ShowMessageBox,
  installMethod = InstallMethod.AppImage
): { updates: UpdateCoordinator; events: UpdateEvent[]; opened: string[]; log: string[] } {
  const events: UpdateEvent[] = []
  const opened: string[] = []
  const log: string[] = []
  const updates = new UpdateCoordinator({
    source,
    installMethod,
    currentVersion: '0.1.0',
    releasesUrl: RELEASES,
    show,
    openExternal: (url) => opened.push(url),
    publish: (event) => events.push(event),
    log: {
      info: (message) => log.push(`info ${message}`),
      error: (message) => log.push(`error ${message}`)
    }
  })
  return { updates, events, opened, log }
}

const phases = (events: readonly UpdateEvent[]): UpdatePhase[] => events.map((event) => event.phase)

describe('UpdateCoordinator', () => {
  it('says so when the running version is the latest', async () => {
    const show = answering(['OK'])
    const { updates, events } = coordinator(fakeSource({ check: async () => null }), show)
    await updates.checkInteractively()
    expect(show.shown[0]?.message).toBe('Genfolio 0.1.0 is up to date.')
    expect(phases(events)).toEqual([UpdatePhase.Checking, UpdatePhase.UpToDate])
  })

  it('checks, downloads with progress, confirms and installs when the user says yes', async () => {
    const source = fakeSource({}, [
      { percent: 50, transferredBytes: 50, totalBytes: 100 },
      { percent: 100, transferredBytes: 100, totalBytes: 100 }
    ])
    const show = answering(['Update now', 'Install and restart'])
    const { updates, events, log } = coordinator(source, show)
    await updates.checkInteractively()
    expect(show.shown[0]).toMatchObject({
      message: 'Genfolio 0.2.0 is available.',
      buttons: ['Update now', 'Later', 'View release']
    })
    expect(show.shown[0]?.detail).toContain('You have Genfolio 0.1.0.')
    expect(show.shown[0]?.detail).toContain(UPDATE.notes)
    expect(show.shown[0]?.detail).not.toContain('password')
    expect(show.shown[1]).toMatchObject({ message: 'Install Genfolio 0.2.0?' })
    expect(phases(events)).toEqual([
      UpdatePhase.Checking,
      UpdatePhase.Available,
      UpdatePhase.Downloading,
      UpdatePhase.Downloading,
      UpdatePhase.Downloading,
      UpdatePhase.Downloaded,
      UpdatePhase.Installing
    ])
    expect(events[3]?.progress).toEqual({ percent: 50, transferredBytes: 50, totalBytes: 100 })
    expect(events.at(-1)?.version).toBe('0.2.0')
    expect(source.install).toHaveBeenCalledOnce()
    expect(log).toEqual(['info update available: 0.2.0', 'info installing update 0.2.0'])
  })

  it('warns about the password prompt for package installs, before and after the download', async () => {
    const show = answering(['Update now', 'Install and restart'])
    const { updates } = coordinator(fakeSource(), show, InstallMethod.Pacman)
    await updates.checkInteractively()
    expect(show.shown[0]?.detail).toContain('ask for your password')
    expect(show.shown[1]?.detail).toContain('ask for your password')
  })

  it('stops at "Later" without downloading, and opens the release for "View release"', async () => {
    const download = vi.fn()
    const later = coordinator(fakeSource({ download }), answering(['Later']))
    await later.updates.checkInteractively()
    const view = coordinator(fakeSource({ download }), answering(['View release']))
    await view.updates.checkInteractively()
    expect(download).not.toHaveBeenCalled()
    expect(later.opened).toEqual([])
    expect(view.opened).toEqual([RELEASES])
    expect(phases(later.events)).toEqual([UpdatePhase.Checking, UpdatePhase.Available])
  })

  it('keeps the download for later when the user declines the install', async () => {
    const source = fakeSource()
    const { updates, events } = coordinator(source, answering(['Update now', 'Later']))
    await updates.checkInteractively()
    expect(source.install).not.toHaveBeenCalled()
    expect(phases(events).at(-1)).toBe(UpdatePhase.Downloaded)
  })

  it('reports a cancelled download as cancelled, not failed, and shows no error', async () => {
    let cancel: (() => void) | undefined
    const source = fakeSource({
      download: () =>
        new Promise<void>((_, reject) => {
          cancel = () => reject(new DownloadCancelledError())
        }),
      cancelDownload: vi.fn(() => cancel?.())
    })
    const show = answering(['Update now'])
    const { updates, events } = coordinator(source, show)
    const run = updates.checkInteractively()
    await vi.waitFor(() => expect(phases(events)).toContain(UpdatePhase.Downloading))
    updates.cancelDownload()
    await run
    expect(source.cancelDownload).toHaveBeenCalledOnce()
    expect(phases(events).at(-1)).toBe(UpdatePhase.Cancelled)
    expect(show.shown).toHaveLength(1)
  })

  it('explains a failed check, offers the releases page and logs only the error name', async () => {
    const source = fakeSource({
      check: async () => {
        throw new TypeError('fetch failed: https://example.test/latest-linux.yml')
      }
    })
    const show = answering(['Open releases page'])
    const { updates, events, opened, log } = coordinator(source, show)
    await updates.checkInteractively()
    expect(show.shown[0]).toMatchObject({ message: 'Could not update Genfolio.' })
    expect(show.shown[0]?.detail).toContain('fetch failed')
    expect(opened).toEqual([RELEASES])
    expect(events.at(-1)).toMatchObject({
      phase: UpdatePhase.Failed,
      message: 'fetch failed: https://example.test/latest-linux.yml'
    })
    expect(log).toEqual(['error update failed: TypeError'])
    expect(updates.busy).toBe(false)
  })

  it('shows only the first line of a long error, cut to a dialog-sized reason', () => {
    const error = new Error(
      `Cannot find latest-linux.yml: ${'x'.repeat(300)}\nHeaders: {...}\n    at createHttpError (/opt/x.js:1:2)`
    )
    const reason = messageOf(error)
    expect(reason).toHaveLength(200)
    expect(reason.endsWith('…')).toBe(true)
    expect(reason).not.toContain('Headers')
    expect(messageOf(new Error(''))).toBe('unknown error')
    expect(messageOf('plain')).toBe('plain')
  })

  it('treats a failed download the same way', async () => {
    const source = fakeSource({
      download: async () => {
        throw new Error('sha512 checksum mismatch')
      }
    })
    const show = answering(['Update now', 'Close'])
    const { updates, events } = coordinator(source, show)
    await updates.checkInteractively()
    expect(phases(events).at(-1)).toBe(UpdatePhase.Failed)
    expect(source.install).not.toHaveBeenCalled()
  })

  it('reports a failed install (a dismissed password prompt) instead of staying on Installing', async () => {
    const source = fakeSource({
      install: vi.fn(() => {
        throw new Error('pkexec exited with code 126')
      })
    })
    const show = answering(['Update now', 'Install and restart', 'Close'])
    const { updates, events } = coordinator(source, show, InstallMethod.Pacman)
    await updates.checkInteractively()
    expect(show.shown[2]).toMatchObject({ message: 'Could not update Genfolio.' })
    expect(show.shown[2]?.detail).toContain('pkexec exited with code 126')
    expect(phases(events).slice(-2)).toEqual([UpdatePhase.Installing, UpdatePhase.Failed])
    expect(updates.busy).toBe(false)
  })

  it('points a build it cannot update at the releases page without checking', async () => {
    const check = vi.fn()
    const show = answering(['Close'])
    const { updates, events } = coordinator(fakeSource({ check }), show, InstallMethod.Unsupported)
    await updates.checkInteractively()
    expect(check).not.toHaveBeenCalled()
    expect(show.shown[0]?.message).toBe('This build cannot update itself.')
    expect(events).toEqual([])
  })

  it('ignores a second check while one is running', async () => {
    let finish: (() => void) | undefined
    const check = vi.fn(
      () =>
        new Promise<AvailableUpdate | null>((resolve) => {
          finish = () => resolve(null)
        })
    )
    const { updates } = coordinator(fakeSource({ check }), answering(['OK']))
    const first = updates.checkInteractively()
    await updates.checkInteractively()
    expect(updates.busy).toBe(true)
    finish?.()
    await first
    expect(check).toHaveBeenCalledOnce()
    expect(updates.busy).toBe(false)
  })
})
