import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WatchSubscription } from '@domain/file-watcher'
import { ChokidarFileWatcher } from './chokidar-file-watcher'

let dir: string
let subscription: WatchSubscription | undefined

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'genfolio-watch-')))
  mkdirSync(join(dir, 'day'))
  mkdirSync(join(dir, 'gone'))
  writeFileSync(join(dir, 'gone', 'x.png'), 'x')
})

afterEach(async () => {
  await subscription?.close()
  rmSync(dir, { recursive: true, force: true })
})

/** Starts watching and resolves once chokidar has read the tree. */
async function watching(changes: string[]): Promise<void> {
  subscription = new ChokidarFileWatcher({ stabilityMs: 100 }).watch(
    dir,
    (change) => changes.push(change.relDir),
    () => undefined
  )
  await subscription.ready
}

describe('ChokidarFileWatcher', () => {
  it('reports images and logs once written, by folder, and ignores other and hidden files', async () => {
    const changes: string[] = []
    await watching(changes)
    writeFileSync(join(dir, 'day', 'a.png'), 'png')
    writeFileSync(join(dir, 'day', 'log.html'), '<html>')
    writeFileSync(join(dir, 'day', 'notes.md'), 'text')
    writeFileSync(join(dir, 'day', '.hidden.png'), 'png')
    writeFileSync(join(dir, 'top.jpg'), 'jpg')
    await expect.poll(() => [...new Set(changes)].sort(), { timeout: 5000 }).toEqual(['', 'day'])
    expect(changes.filter((relDir) => relDir === 'day')).toHaveLength(2)
  })

  it('is ready only once the tree has been read, and reports files written after that', async () => {
    const changes: string[] = []
    subscription = new ChokidarFileWatcher({ stabilityMs: 100 }).watch(
      dir,
      (change) => changes.push(change.relDir),
      () => undefined
    )
    await subscription.ready
    writeFileSync(join(dir, 'day', 'late.png'), 'png')
    await expect.poll(() => changes, { timeout: 5000 }).toContain('day')
  })

  it('is ready, not stuck, when the watch fails', async () => {
    const failures: unknown[] = []
    subscription = new ChokidarFileWatcher({ stabilityMs: 100 }).watch(
      join(dir, 'missing', 'deeper'),
      () => undefined,
      (error) => failures.push(error)
    )
    await expect(
      Promise.race([
        subscription.ready.then(() => 'ready'),
        new Promise((resolve) => setTimeout(() => resolve('stuck'), 3000))
      ])
    ).resolves.toBe('ready')
  })

  it('reports a removed folder and its parent', async () => {
    const changes: string[] = []
    await watching(changes)
    rmSync(join(dir, 'gone'), { recursive: true })
    await expect
      .poll(() => changes.includes('gone') && changes.includes(''), { timeout: 5000 })
      .toBe(true)
  })
})
