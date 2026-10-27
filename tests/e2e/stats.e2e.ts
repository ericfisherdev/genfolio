import { rmSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { cards } from './support/cards'
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

const LORA = 'add-detail-xl'
const LORA_HASH = `#/stats/lora/${LORA}`

async function openStats(): Promise<Page> {
  const page = await current().app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await stubFolderPicker(current().app, library)
  await addAndAwaitScan(page)
  await page.getByRole('navigation').getByRole('button', { name: 'Stats' }).click()
  await expect(page.getByRole('heading', { name: 'Stats' })).toBeVisible()
  return page
}

const loraSection = (page: Page): Locator =>
  page.getByRole('region', { name: 'LoRAs', exact: true })
const loraRow = (page: Page): Locator => loraSection(page).getByRole('row', { name: LORA })
const usageOf = (page: Page): Locator => page.getByRole('article', { name: `${LORA} usage` })
const hashOf = (page: Page): Promise<string> => page.evaluate(() => location.hash)

async function openLoraDrillDown(page: Page): Promise<void> {
  await loraSection(page).getByRole('link', { name: LORA }).click()
  await expect(usageOf(page)).toBeVisible()
}

async function tagWithLighting(page: Page): Promise<void> {
  const box = page.getByRole('combobox', { name: 'Add a model tag' })
  await box.fill('lighting')
  await box.press('Enter')
  await expect(usageOf(page).getByRole('list', { name: 'Tags of this model' })).toContainText(
    'lighting'
  )
}

/** The number in the row's Images column. */
async function imageCountOf(row: Locator): Promise<number> {
  const text = await row.getByRole('cell').nth(1).innerText()
  return Number(text.replace(/\D/g, ''))
}

test('opens a LoRA from the Stats page, and Back to overview returns to the lists', async () => {
  const page = await openStats()
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Stats' })).toHaveAttribute(
    'aria-current',
    'page'
  )
  await openLoraDrillDown(page)
  expect(await hashOf(page)).toBe(LORA_HASH)
  await expect(usageOf(page).getByRole('heading', { name: LORA })).toBeVisible()
  await expect(
    usageOf(page).getByRole('region', { name: 'Checkpoints it is used with' })
  ).toBeVisible()
  await expect(usageOf(page).getByRole('region', { name: 'LoRAs used with it' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Model tag', exact: true })).toHaveCount(0)

  await usageOf(page).getByRole('link', { name: 'Back to overview' }).click()
  await expect(loraSection(page)).toBeVisible()
  expect(await hashOf(page)).toBe('#/stats')

  await page.goBack()
  await expect(usageOf(page)).toBeVisible()
  await page.goForward()
  await expect(loraSection(page)).toBeVisible()
})

test('shows the images of a drill-down count, and of a partner row, in the gallery', async () => {
  const page = await openStats()
  const rowCount = await imageCountOf(loraRow(page))
  await openLoraDrillDown(page)
  await expect(usageOf(page)).toContainText(`${rowCount} images`)

  await usageOf(page)
    .getByRole('button', { name: `Show all images using ${LORA}` })
    .click()
  await expect(cards(page)).toHaveCount(rowCount)

  await page.evaluate((hash) => (location.hash = hash), LORA_HASH)
  const checkpoints = usageOf(page).getByRole('region', { name: 'Checkpoints it is used with' })
  const pairRow = checkpoints.getByRole('row').nth(1)
  const pairCount = await imageCountOf(pairRow)
  await pairRow.getByRole('button', { name: /^Show images using / }).click()
  await expect(cards(page)).toHaveCount(pairCount)
})

test('a tag added in the drill-down filters the overview, the Models page and the gallery', async () => {
  const page = await openStats()
  const rowCount = await imageCountOf(loraRow(page))
  await openLoraDrillDown(page)
  await tagWithLighting(page)

  await usageOf(page).getByRole('link', { name: 'Back to overview' }).click()
  await page
    .getByRole('combobox', { name: 'Model tag', exact: true })
    .selectOption({ label: 'lighting (1)' })
  expect(await hashOf(page)).toMatch(/^#\/stats\?mtag=\d+$/)
  await expect(loraSection(page).getByRole('row')).toHaveCount(2)
  await expect(loraRow(page)).toBeVisible()
  await expect(loraRow(page).getByRole('list', { name: `Tags of ${LORA}` })).toContainText(
    'lighting'
  )

  await loraRow(page)
    .getByRole('button', { name: `Show images using ${LORA}` })
    .click()
  await expect(cards(page)).toHaveCount(rowCount)

  await page.evaluate((hash) => (location.hash = hash), LORA_HASH)
  await usageOf(page)
    .getByRole('button', { name: `Open ${LORA} in Models` })
    .click()
  expect(await hashOf(page)).toMatch(/^#\/models\?/)
  await expect(page.getByRole('list', { name: 'Tags of this model' })).toContainText('lighting')

  await page.evaluate(() => (location.hash = '#/'))
  await expect(cards(page)).toHaveCount(6)
  await page.getByRole('button', { name: /^Model tags/ }).click()
  await page
    .getByRole('dialog', { name: 'Model tags' })
    .getByRole('checkbox', { name: /lighting/ })
    .check()
  await expect(cards(page)).toHaveCount(rowCount)
})

test('a tag removed on the Models page disappears from the drill-down', async () => {
  const page = await openStats()
  await openLoraDrillDown(page)
  await tagWithLighting(page)

  await usageOf(page)
    .getByRole('button', { name: `Open ${LORA} in Models` })
    .click()
  await page.getByRole('button', { name: 'Remove tag lighting' }).click()
  await expect(page.getByRole('list', { name: 'Tags of this model' })).toHaveCount(0)

  await page.goBack()
  await expect(usageOf(page)).toBeVisible()
  await expect(usageOf(page).getByRole('list', { name: 'Tags of this model' })).toHaveCount(0)
})

test('a drill-down address survives a reload', async () => {
  const page = await openStats()
  await openLoraDrillDown(page)
  await tagWithLighting(page)

  await page.reload()
  await expect(usageOf(page)).toBeVisible()
  expect(await hashOf(page)).toBe(LORA_HASH)
  await expect(usageOf(page).getByRole('list', { name: 'Tags of this model' })).toContainText(
    'lighting'
  )
  await expect(
    usageOf(page).getByRole('region', { name: 'Checkpoints it is used with' })
  ).toBeVisible()
})

test('a model no image uses says so instead of failing', async () => {
  const page = await openStats()
  await page.evaluate(() => (location.hash = '#/stats/lora/not-in-this-library'))
  await expect(page.getByText('Not used by any image.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to overview' })).toBeVisible()
})
