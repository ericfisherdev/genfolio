import { rmSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { cardNames, cards } from './support/cards'
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

async function openGallery(): Promise<Page> {
  const page = await current().app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await stubFolderPicker(current().app, library)
  await addAndAwaitScan(page)
  await page.evaluate(() => (location.hash = '#/'))
  await expect(cards(page)).toHaveCount(6)
  return page
}

const slide = (page: Page): Locator => page.locator('.slide')

test('the slideshow steps, pauses, shows the prompt and returns where it started', async () => {
  const page = await openGallery()
  const names = await cardNames(page)

  await page.getByRole('button', { name: '▶ Slideshow' }).click()
  const show = page.getByRole('region', { name: 'Slideshow' })
  await expect(show).toBeVisible()
  await expect(slide(page)).toHaveAttribute('alt', names[0] ?? '')

  await page.keyboard.press('ArrowRight')
  await expect(slide(page)).toHaveAttribute('alt', names[1] ?? '')
  await page.keyboard.press('ArrowLeft')
  await expect(slide(page)).toHaveAttribute('alt', names[0] ?? '')

  await page.keyboard.press(' ')
  await expect(show.getByRole('button', { name: 'Play' })).toBeVisible()
  await page.keyboard.press('i')
  await expect(show.locator('.prompt')).toBeVisible()
  await page.keyboard.press('i')
  await expect(show.locator('.prompt')).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(show).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'All Photos' })).toBeVisible()
  expect(await page.evaluate(() => location.hash)).toBe('#/')
})

test('the slideshow started from an image returns to that image', async () => {
  const page = await openGallery()
  await cards(page)
    .nth(2)
    .getByRole('button', { name: /^Open / })
    .click()
  const details = page.getByRole('complementary', { name: 'File details' })
  await expect(details).toBeVisible()
  const hash = await page.evaluate(() => location.hash)
  await page.getByRole('button', { name: '▶ Slideshow' }).click()
  await expect(page.getByRole('region', { name: 'Slideshow' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(details).toBeVisible()
  expect(await page.evaluate(() => location.hash)).toBe(hash)
})
