import { existsSync, mkdtempSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { addAndAwaitScan, makeLibrary, stubFolderPicker } from './support/library'
import { launchApp, type LaunchedApp } from './support/launch'

let launched: LaunchedApp | undefined
let library: string
let trash: string

const current = (): LaunchedApp => {
  if (!launched) throw new Error('app was not launched')
  return launched
}
const day = (): string => join(library, '2026-09-27')

test.beforeEach(async () => {
  launched = undefined
  library = makeLibrary()
  trash = mkdtempSync(join(tmpdir(), 'genfolio-trash-'))
  launched = await launchApp()
})

test.afterEach(async () => {
  try {
    await launched?.close()
  } finally {
    rmSync(library, { recursive: true, force: true })
    rmSync(trash, { recursive: true, force: true })
  }
})

/**
 * Replaces the system trash with a folder, failing for file names in `refuse`, and answers
 * main's confirmation dialogs with `answer` (0 Cancel, 1 Delete permanently), recording them.
 */
async function stubTrashAndDialogs(
  app: ElectronApplication,
  options: { refuse?: string[]; answer: number }
): Promise<void> {
  await app.evaluate(
    ({ shell, dialog }, { trashDir, refuse, answer }) => {
      const fs = process.getBuiltinModule('node:fs')
      const path = process.getBuiltinModule('node:path')
      shell.trashItem = async (file: string) => {
        if (refuse.includes(path.basename(file))) {
          throw Object.assign(new Error('trash unavailable'), { code: 'EXDEV' })
        }
        fs.renameSync(file, path.join(trashDir, path.basename(file)))
      }
      const asked: string[] = []
      ;(globalThis as { askedToDelete?: string[] }).askedToDelete = asked
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const options = args.at(-1) as { message: string }
        asked.push(options.message)
        return { response: answer, checkboxChecked: false }
      }) as unknown as typeof dialog.showMessageBox
    },
    { trashDir: trash, refuse: options.refuse ?? [], answer: options.answer }
  )
}

const asked = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => (globalThis as { askedToDelete?: string[] }).askedToDelete ?? [])

async function openGallery(): Promise<Page> {
  const page = await current().app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await stubFolderPicker(current().app, library)
  await addAndAwaitScan(page)
  await page.evaluate(() => (location.hash = '#/'))
  await expect(cards(page)).toHaveCount(6)
  return page
}

const cards = (page: Page): Locator =>
  page.getByRole('list', { name: 'Images' }).getByRole('listitem')

function cardNames(page: Page): Promise<string[]> {
  return cards(page)
    .getByRole('article')
    .evaluateAll((articles) => articles.map((article) => article.getAttribute('aria-label') ?? ''))
}

test('a bulk delete trashes the files, forgets missing ones and reports the one it could not delete', async () => {
  const page = await openGallery()
  const [trashed, locked, missing] = await cardNames(page)
  if (!trashed || !locked || !missing) throw new Error('not enough images')
  await stubTrashAndDialogs(current().app, { refuse: [locked], answer: 0 })
  unlinkSync(join(day(), missing))

  for (const name of [trashed, locked, missing]) {
    await page.getByRole('checkbox', { name: `Select ${name}` }).click()
  }
  await page.getByRole('button', { name: 'Move to trash' }).click()

  const report = page.getByRole('dialog', { name: 'Some images were not deleted' })
  await expect(report).toContainText(locked)
  await expect(report.getByRole('listitem')).toHaveCount(1)
  await expect(
    page.getByRole('status').filter({
      hasText: 'Moved 1 image to the trash. 1 image was already gone. Could not delete 1 image.'
    })
  ).toBeVisible()
  await report.getByRole('button', { name: 'OK' }).click()

  expect(await asked(current().app)).toEqual([
    '1 image file could not be moved to the trash. Delete permanently instead?'
  ])
  expect(readdirSync(trash)).toEqual([trashed])
  expect(existsSync(join(day(), locked))).toBe(true)
  await expect(cards(page)).toHaveCount(4)
  expect(await cardNames(page)).toContain(locked)
})

test('a permanent delete needs the confirmation in main, and declining keeps the file', async () => {
  const page = await openGallery()
  const [first, second] = await cardNames(page)
  if (!first || !second) throw new Error('not enough images')

  await stubTrashAndDialogs(current().app, { answer: 0 })
  await page.getByRole('button', { name: `Actions for ${first}` }).click()
  await page.getByRole('menuitem', { name: 'Delete permanently…' }).click()
  await expect.poll(() => asked(current().app)).toEqual(['Delete 1 image file permanently?'])
  expect(existsSync(join(day(), first))).toBe(true)
  await expect(cards(page)).toHaveCount(6)

  await stubTrashAndDialogs(current().app, { answer: 1 })
  await page.getByRole('button', { name: `Actions for ${second}` }).click()
  await page.getByRole('menuitem', { name: 'Delete permanently…' }).click()
  await expect(cards(page)).toHaveCount(5)
  expect(existsSync(join(day(), second))).toBe(false)
  expect(readdirSync(trash)).toEqual([])
})

test('Delete on the detail page trashes the image and shows the next one', async () => {
  const page = await openGallery()
  const [first, second] = await cardNames(page)
  if (!first || !second) throw new Error('not enough images')
  await stubTrashAndDialogs(current().app, { answer: 0 })
  await page.getByRole('button', { name: `Open ${first}` }).click()
  const details = page.getByRole('complementary', { name: 'File details' })
  await expect(details).toContainText(first)
  await page.keyboard.press('Delete')
  await expect(details).toContainText(second)
  expect(readdirSync(trash)).toEqual([first])
  await page.keyboard.press('Escape')
  await expect(cards(page)).toHaveCount(5)
})
