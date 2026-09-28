import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync } from 'node:fs'
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

test('a file written while the app runs appears with its prompt, and deletes and moves follow', async () => {
  library = makeLibrary()
  launched = await launchApp()
  const page = await launched.app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await stubFolderPicker(launched.app, library)
  await addAndAwaitScan(page)
  await page.evaluate(() => (location.hash = '#/'))
  await expect(cards(page)).toHaveCount(6)

  const day = join(library, '2026-09-27')
  const [source, deleted, moved] = readdirSync(day)
    .filter((name) => name.endsWith('.png'))
    .sort()
  if (!source || !deleted || !moved) throw new Error('not enough fixtures')

  // Written as a running generator would: the file lands, then must settle (2 s).
  const written = Date.now()
  copyFileSync(join(day, source), join(day, 'live-written.png'))
  await expect(cards(page)).toHaveCount(7, { timeout: 6_000 })
  const appearedMs = Date.now() - written
  console.info(`[perf] a live write appeared after ${appearedMs} ms`)
  const prompt = await page.evaluate(async () => {
    const layout = await window.genfolio.getImageLayout({
      scope: { kind: 'all' },
      sort: 'newest'
    } as never)
    const ids = Array.from(layout.filter((_, index) => index % 3 === 0))
    const cards = await window.genfolio.getImages(ids)
    const card = cards.find((each) => each.fileName === 'live-written.png')
    return card ? (await window.genfolio.getGeneration(card.id))?.prompt : undefined
  })
  expect(prompt).toBeTruthy()

  unlinkSync(join(day, deleted))
  await expect(cards(page)).toHaveCount(6, { timeout: 6_000 })
  expect(await cardNames(page)).not.toContain(deleted)

  // Moved into a new folder inside the library: gone from its old folder, found in the new one.
  mkdirSync(join(library, 'moved'))
  renameSync(join(day, moved), join(library, 'moved', moved))
  await expect(page.getByRole('treeitem', { name: /^moved/ })).toBeVisible({ timeout: 6_000 })
  await expect(cards(page)).toHaveCount(6)
  expect(await cardNames(page)).toContain(moved)
})
