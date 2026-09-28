import { rmSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { LAYOUT_STRIDE } from '../../src/shared/gallery-kinds'
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
  await expect(page.getByRole('listitem')).toHaveCount(6)
  return page
}

const cards = (page: Page): Locator =>
  page.getByRole('list', { name: 'Images' }).getByRole('listitem')
const card = (page: Page, name: string): Locator => page.getByRole('article', { name })

test('favourites and ratings persist, filter and sort', async () => {
  const page = await openGallery()
  const first = card(page, '2026-09-27_20-38-19_1754.png')
  await first.hover()
  await first.getByRole('button', { name: /^Favourite / }).click()
  await first
    .getByRole('group', { name: /^Rating of / })
    .getByRole('button', { name: '4 stars' })
    .click()
  const second = card(page, '2026-09-27_20-45-48_2563.webp')
  await second.hover()
  await second
    .getByRole('group', { name: /^Rating of / })
    .getByRole('button', { name: '2 stars' })
    .click()

  await page.getByRole('button', { name: '♥ Favourites' }).click()
  await expect(cards(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear all' }).click()
  await page.getByRole('combobox', { name: 'Minimum rating' }).selectOption('2')
  await expect(cards(page)).toHaveCount(2)
  await page.getByRole('button', { name: 'Clear all' }).click()

  await page.getByRole('combobox', { name: 'Sort by' }).selectOption({ label: 'Rating' })
  await expect(cards(page).first().getByRole('article')).toHaveAttribute(
    'aria-label',
    '2026-09-27_20-38-19_1754.png'
  )
  await expect(cards(page).nth(1).getByRole('article')).toHaveAttribute(
    'aria-label',
    '2026-09-27_20-45-48_2563.webp'
  )

  // Stored, not just shown: a fresh read of the cards reports the marks.
  const stored = await page.evaluate(async () => {
    const layout = await window.genfolio.getImageLayout({
      scope: { kind: 'all' },
      sort: 'rating'
    } as never)
    const [top] = await window.genfolio.getImages([layout[0] ?? 0])
    return top && { favorite: top.favorite, rating: top.rating }
  })
  expect(stored).toEqual({ favorite: true, rating: 4 })
})

test('F and the number keys mark the image on the detail page', async () => {
  const page = await openGallery()
  await card(page, '2026-09-27_20-36-27_8675.png')
    .getByRole('button', { name: /^Open / })
    .click()
  const details = page.getByRole('complementary', { name: 'File details' })
  await expect(details).toContainText('2026-09-27_20-36-27_8675.png')
  await page.keyboard.press('f')
  await page.keyboard.press('3')
  await expect(details.getByRole('button', { name: /Favourite/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(details.getByRole('button', { name: '3 stars' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.keyboard.press('0')
  await expect(details.getByRole('button', { name: '3 stars' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )

  // Stored, not just shown: a failed write would have put the marks back by now.
  await expect
    .poll(() => storedMarks(page, '2026-09-27_20-36-27_8675.png'))
    .toEqual({ favorite: true, rating: 0 })
})

/** The marks of the named image as the database has them. */
async function storedMarks(
  page: Page,
  fileName: string
): Promise<{ favorite: boolean; rating: number } | undefined> {
  return page.evaluate(
    async ({ name, stride }) => {
      const layout = await window.genfolio.getImageLayout({
        scope: { kind: 'all' },
        sort: 'newest'
      } as never)
      const ids = Array.from(layout.filter((_, index) => index % stride === 0))
      const cards = await window.genfolio.getImages(ids)
      const image = cards.find((card) => card.fileName === name)
      return image && { favorite: image.favorite, rating: image.rating }
    },
    { name: fileName, stride: LAYOUT_STRIDE }
  )
}
