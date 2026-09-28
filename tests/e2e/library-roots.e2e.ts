import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { AddRootViaDialogResult } from '../../src/shared/library'
import type { ScanEvent } from '../../src/shared/scan'
import { launchApp, tempUserData, type LaunchedApp } from './support/launch'

const FIXTURES = resolve(__dirname, '../fixtures/fooocus')
let launched: LaunchedApp
let library: string

/** A library folder holding copies of the committed Fooocus fixture images. */
function makeLibrary(): string {
  const root = mkdtempSync(join(tmpdir(), 'genfolio-library-'))
  const day = join(root, '2026-09-27')
  mkdirSync(day)
  for (const name of readdirSync(FIXTURES).filter((n) => /\.(png|webp|jpe?g)$/.test(n))) {
    copyFileSync(join(FIXTURES, name), join(day, name))
  }
  return root
}

/** Makes the folder picker return `path` (or cancel when undefined). */
async function stubFolderPicker(app: ElectronApplication, path: string | undefined): Promise<void> {
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () =>
      picked === undefined
        ? { canceled: true, filePaths: [] }
        : { canceled: false, filePaths: [picked] }) as unknown as typeof dialog.showOpenDialog
  }, path)
}

/** Adds via the dialog and, when a scan starts, waits for its finished event. */
function addAndAwaitScan(
  page: Page
): Promise<{ result: AddRootViaDialogResult; finished: ScanEvent | undefined }> {
  return page.evaluate(async () => {
    let resolveFinished: (event: ScanEvent) => void = () => undefined
    const finished = new Promise<ScanEvent>((resolve) => (resolveFinished = resolve))
    const off = window.genfolio.onScanEvent((event) => {
      if (event.type !== 'progress') resolveFinished(event)
    })
    const result = await window.genfolio.addRootViaDialog()
    const event = result.outcome === 'added' ? await finished : undefined
    off()
    return { result, finished: event }
  })
}

test.beforeEach(async () => {
  library = makeLibrary()
  launched = await launchApp()
})

test.afterEach(async () => {
  await launched.close()
  rmSync(library, { recursive: true, force: true })
})

test('adding a folder scans it and lists the root with its image count', async () => {
  const page = await launched.app.firstWindow()
  await stubFolderPicker(launched.app, library)

  const { result, finished } = await addAndAwaitScan(page)

  expect(result).toMatchObject({ outcome: 'added', absorbedRoots: 0 })
  expect(finished).toMatchObject({ type: 'finished', report: { added: 6, failed: 0 } })
  const roots = await page.evaluate(() => window.genfolio.listRoots())
  expect(roots).toEqual([
    expect.objectContaining({ path: library, imageCount: 6, scanning: false })
  ])
})

test('a folder inside an existing root is rejected and a cancelled picker changes nothing', async () => {
  const page = await launched.app.firstWindow()
  await stubFolderPicker(launched.app, library)
  await addAndAwaitScan(page)

  await stubFolderPicker(launched.app, join(library, '2026-09-27'))
  expect((await addAndAwaitScan(page)).result).toEqual({
    outcome: 'inside-existing-root',
    path: library
  })

  await stubFolderPicker(launched.app, undefined)
  expect((await addAndAwaitScan(page)).result).toEqual({ outcome: 'cancelled' })
  expect(await page.evaluate(() => window.genfolio.listRoots())).toHaveLength(1)
})

test('removing a root forgets it but leaves the files on disk', async () => {
  const page = await launched.app.firstWindow()
  await stubFolderPicker(launched.app, library)
  await addAndAwaitScan(page)
  const [root] = await page.evaluate(() => window.genfolio.listRoots())

  expect(await page.evaluate((id) => window.genfolio.removeRoot(id), root?.id as number)).toBe(true)
  expect(await page.evaluate(() => window.genfolio.listRoots())).toEqual([])
  expect(readdirSync(join(library, '2026-09-27'))).toHaveLength(6)
  expect(existsSync(library)).toBe(true)
})

test('a database from a newer app is reported instead of crashing', async () => {
  await launched.close()
  const userData = tempUserData()
  const db = new Database(join(userData, 'genfolio.db'))
  db.pragma('user_version = 99')
  db.close()
  launched = await launchApp(userData)

  const page = await launched.app.firstWindow()
  await expect(page.getByRole('alert')).toContainText('Update Genfolio')
})
