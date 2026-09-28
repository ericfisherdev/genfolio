import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { makeLibrary, stubFolderPicker } from './support/library'
import { launchApp, type LaunchedApp } from './support/launch'

let launched: LaunchedApp | undefined
let library: string

const current = (): LaunchedApp => {
  if (!launched) throw new Error('app was not launched')
  return launched
}

async function addFolderThroughUi(page: Page): Promise<void> {
  await stubFolderPicker(current().app, library)
  await page.getByRole('button', { name: 'Add folder', exact: true }).click()
  await expect(page.getByRole('treeitem', { name: /, 6 images$/ }).first()).toBeVisible()
}

test.beforeEach(async () => {
  launched = undefined
  library = makeLibrary()
  launched = await launchApp()
})

test.afterEach(async () => {
  try {
    await launched?.close()
  } finally {
    rmSync(library, { recursive: true, force: true })
  }
})

test('adding a folder from the empty state shows it in the folder tree', async () => {
  const page = await current().app.firstWindow()
  await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible()

  await addFolderThroughUi(page)

  await expect(page.getByRole('button', { name: /All Photos/ })).toContainText('6')
  await expect(page.getByRole('treeitem', { name: '2026-09-27, 6 images' })).toBeVisible()
})

test('opening a folder routes to it and titles the view', async () => {
  const page = await current().app.firstWindow()
  await addFolderThroughUi(page)

  await page.getByRole('treeitem', { name: '2026-09-27, 6 images' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2026-09-27')
  expect(await page.evaluate(() => location.hash)).toMatch(/^#\/dir\/\d+\?recursive=1$/)
  await expect(page.getByRole('region', { name: 'Library contents' })).toContainText('6 images')
})

test('removing a root asks first and leaves the files on disk', async () => {
  const page = await current().app.firstWindow()
  await addFolderThroughUi(page)
  const rootName = library.split('/').pop() as string

  await page.getByRole('button', { name: `Actions for ${rootName}` }).click()
  await page.getByRole('menuitem', { name: /Remove from library/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('stay on disk and are not deleted')
  await dialog.getByRole('button', { name: 'Remove' }).click()

  await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible()
  expect(readdirSync(join(library, '2026-09-27'))).toHaveLength(6)
})

test('the sort order survives a restart', async () => {
  const page = await current().app.firstWindow()
  await page.getByRole('combobox', { name: 'Sort by' }).selectOption('file-name')
  const userData = current().userData
  await current().close({ keepUserData: true })
  launched = await launchApp(userData)

  const relaunched = await current().app.firstWindow()
  await expect(relaunched.getByRole('combobox', { name: 'Sort by' })).toHaveValue('file-name')
})
