import { rmSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { addAndAwaitScan, makeLibrary, stubFolderPicker } from './support/library'
import { launchApp, type LaunchedApp } from './support/launch'

let launched: LaunchedApp | undefined
let library: string

const current = (): LaunchedApp => {
  if (!launched) throw new Error('app was not launched')
  return launched
}

test.beforeEach(async () => {
  launched = undefined
  library = makeLibrary({ withLog: true })
  launched = await launchApp()
})

test.afterEach(async () => {
  try {
    await launched?.close()
  } finally {
    rmSync(library, { recursive: true, force: true })
  }
})

async function openGallery(): Promise<Page> {
  const page = await current().app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await stubFolderPicker(current().app, library)
  await addAndAwaitScan(page)
  await page.evaluate(() => (location.hash = '#/'))
  await expect(page.getByRole('listitem')).toHaveCount(6)
  return page
}

const cards = (page: Page): Locator =>
  page.getByRole('list', { name: 'Images' }).getByRole('listitem')

async function pick(page: Page, picker: 'Checkpoint' | 'LoRA', names: string[]): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${picker}`) }).click()
  const dialog = page.getByRole('dialog', { name: picker })
  for (const name of names) await dialog.getByRole('checkbox', { name: new RegExp(name) }).check()
}

test('filters by checkpoint and by LoRAs with All or Any', async () => {
  const page = await openGallery()
  await pick(page, 'Checkpoint', ['ultraRealisticByStable_v25'])
  await expect(cards(page)).toHaveCount(2)
  await expect(page.getByText('2 of 6 images')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(cards(page)).toHaveCount(6)

  await pick(page, 'LoRA', ['add-detail-xl'])
  await expect(cards(page)).toHaveCount(4)
  await page
    .getByRole('dialog', { name: 'LoRA' })
    .getByRole('checkbox', { name: /sd_xl_dpo/ })
    .check()
  await expect(cards(page)).toHaveCount(5)
  await page
    .getByRole('dialog', { name: 'LoRA' })
    .getByRole('radio', { name: /all selected/ })
    .check()
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page).getByRole('article')).toHaveAttribute('aria-label', /20-45-48/)
})

test('keyword search follows its scope, and an exclusion that removes everything offers Clear filters', async () => {
  const page = await openGallery()
  const search = page.getByRole('searchbox', { name: 'Search prompts' })
  // Every fixture's prompt is the same, and only the negative prompts mention watermarks,
  // so each step here changes the result.
  await search.fill('watermark')
  await search.press('Enter')
  await expect(page.getByText('No images match these filters.')).toBeVisible()
  await page.getByRole('combobox', { name: 'Search in' }).selectOption({ label: 'Negative prompt' })
  await expect(cards(page)).toHaveCount(6)
  await expect(page.getByText('6 of 6 images')).toBeVisible()
  await page.getByRole('combobox', { name: 'Search in' }).selectOption({ label: 'Prompt' })
  await search.fill('-teapot')
  await search.press('Enter')
  await expect(page.getByText('No images match these filters.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(cards(page)).toHaveCount(6)
  await expect(search).toHaveValue('')
})

test('filters live in the route: back, forward and deep links restore them', async () => {
  const page = await openGallery()
  await pick(page, 'Checkpoint', ['intorealism_sdxlV4'])
  await expect(cards(page)).toHaveCount(4)
  await page.keyboard.press('Escape')
  const filteredHash = await page.evaluate(() => location.hash)
  expect(filteredHash).toMatch(/^#\/\?ckpt=\d+$/)

  await page.goBack()
  await expect(cards(page)).toHaveCount(6)
  await page.goForward()
  await expect(cards(page)).toHaveCount(4)

  await page.evaluate(() => (location.hash = '#/'))
  await expect(cards(page)).toHaveCount(6)
  await page.evaluate((hash) => (location.hash = `${hash}&seed=nope&gen=bogus`), filteredHash)
  await expect(page.getByText('No images match these filters.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Active filters' })).toContainText('Seed: nope')
})
