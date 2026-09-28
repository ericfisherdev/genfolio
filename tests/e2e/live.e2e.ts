import { copyFileSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { cardNames, cards } from './support/cards'
import { addAndAwaitScan, makeLibrary, stubFolderPicker } from './support/library'
import { launchApp, type LaunchedApp } from './support/launch'

let launched: LaunchedApp | undefined
let library: string

test.afterEach(async () => {
  try {
    await launched?.close()
  } finally {
    rmSync(library, { recursive: true, force: true })
  }
})

test('changes made while the app was closed show after a restart', async () => {
  library = makeLibrary()
  const first = await launchApp()
  const page = await first.app.firstWindow()
  await stubFolderPicker(first.app, library)
  await addAndAwaitScan(page)
  await page.evaluate(() => (location.hash = '#/'))
  await expect(cards(page)).toHaveCount(6)
  await first.close({ keepUserData: true })

  // While closed: one image deleted, one added under a new name.
  const day = join(library, '2026-09-27')
  const [gone, source] = readdirSync(day)
    .filter((name) => name.endsWith('.png'))
    .sort()
  if (!gone || !source) throw new Error('not enough fixtures')
  unlinkSync(join(day, gone))
  copyFileSync(join(day, source), join(day, 'added-while-closed.png'))

  launched = await launchApp(first.userData)
  const reopened = await launched.app.firstWindow()
  await reopened.evaluate(() => (location.hash = '#/'))
  await expect(cards(reopened)).toHaveCount(6)
  const names = await cardNames(reopened)
  expect(names).toContain('added-while-closed.png')
  expect(names).not.toContain(gone)
})
