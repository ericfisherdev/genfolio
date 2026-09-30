import { EventEmitter } from 'node:events'
import type { AppUpdater, CancellationToken, UpdateCheckResult, UpdateInfo } from 'electron-updater'
import { describe, expect, it, vi } from 'vitest'
import { ElectronUpdaterSource, plainNotes } from './electron-updater-source'
import { DownloadCancelledError } from './update-source'

const INFO: UpdateInfo = {
  version: '0.2.0',
  files: [],
  path: 'genfolio-0.2.0-x86_64.AppImage',
  sha512: '',
  releaseDate: '2026-10-01T00:00:00.000Z',
  releaseNotes: '<p>Copy for <b>Fooocus</b>.</p><ul><li>One</li><li>Two</li></ul>'
}

/** The parts of AppUpdater the source touches, over a real emitter for the progress events. */
function fakeUpdater(result: UpdateCheckResult | null): AppUpdater & {
  downloadUpdate: ReturnType<typeof vi.fn>
  quitAndInstall: ReturnType<typeof vi.fn>
} {
  const emitter = new EventEmitter()
  return Object.assign(emitter, {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    logger: null,
    checkForUpdates: vi.fn(async () => result),
    downloadUpdate: vi.fn(async (token?: CancellationToken) => {
      emitter.emit('download-progress', {
        percent: 12.5,
        transferred: 1000.4,
        total: 8000,
        delta: 1000,
        bytesPerSecond: 1
      })
      if (token?.cancelled) throw new Error('cancelled')
      return []
    }),
    quitAndInstall: vi.fn()
  }) as unknown as ReturnType<typeof fakeUpdater>
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('ElectronUpdaterSource', () => {
  it('turns automatic download and install off and installs the logger', () => {
    const updater = fakeUpdater(null)
    new ElectronUpdaterSource(updater, logger)
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.logger).toBe(logger)
  })

  it('reports the newer release with plain-text notes, or null when up to date', async () => {
    const newer = new ElectronUpdaterSource(
      fakeUpdater({ isUpdateAvailable: true, updateInfo: INFO, versionInfo: INFO }),
      logger
    )
    await expect(newer.check()).resolves.toEqual({
      version: '0.2.0',
      releaseDate: INFO.releaseDate,
      notes: 'Copy for Fooocus.\nOne\nTwo'
    })
    const current = new ElectronUpdaterSource(
      fakeUpdater({ isUpdateAvailable: false, updateInfo: INFO, versionInfo: INFO }),
      logger
    )
    await expect(current.check()).resolves.toBeNull()
  })

  it('rejects the check when electron-updater is inactive (an unpackaged build)', async () => {
    const source = new ElectronUpdaterSource(fakeUpdater(null), logger)
    await expect(source.check()).rejects.toThrow('cannot check for updates')
  })

  it('forwards download progress as whole bytes within 0–100 percent, then stops listening', async () => {
    const updater = fakeUpdater(null)
    const source = new ElectronUpdaterSource(updater, logger)
    const progress = vi.fn()
    await source.download(progress)
    expect(progress).toHaveBeenCalledWith({
      percent: 12.5,
      transferredBytes: 1000,
      totalBytes: 8000
    })
    expect(updater.listenerCount('download-progress')).toBe(0)
  })

  it('turns a cancelled download into DownloadCancelledError', async () => {
    const updater = fakeUpdater(null)
    updater.downloadUpdate.mockImplementation((token: CancellationToken) =>
      token.createPromise((_resolve, reject, onCancel) => {
        onCancel(() => reject(new Error('cancelled')))
      })
    )
    const source = new ElectronUpdaterSource(updater, logger)
    const download = source.download(vi.fn())
    source.cancelDownload()
    await expect(download).rejects.toBeInstanceOf(DownloadCancelledError)
  })

  it('installs not silently and asks for a relaunch', () => {
    const updater = fakeUpdater(null)
    new ElectronUpdaterSource(updater, logger).install()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
})

describe('plainNotes', () => {
  it('strips tags, keeps line breaks, and cuts long notes', () => {
    expect(plainNotes('<h2>0.2.0</h2><p>a  b</p>\n\n<br>c')).toBe('0.2.0\na b\nc')
    expect(
      plainNotes([
        { version: '0.2.0', note: '<p>x</p>' },
        { version: '0.1.1', note: null }
      ])
    ).toBe('x')
    expect(plainNotes(null)).toBeNull()
    expect(plainNotes('   ')).toBeNull()
    const long = plainNotes('y'.repeat(1000))
    expect(long).toHaveLength(600)
    expect(long?.endsWith('…')).toBe(true)
  })
})
