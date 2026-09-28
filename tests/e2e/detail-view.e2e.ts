import { rmSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { addAndAwaitScan, makeLibrary, stubFolderPicker } from './support/library'
import { launchApp, type LaunchedApp } from './support/launch'

let launched: LaunchedApp | undefined
let library: string

const current = (): LaunchedApp => {
  if (!launched) throw new Error('app was not launched')
  return launched
}

async function openLibrary(size = { width: 1280, height: 800 }): Promise<Page> {
  const page = await current().app.firstWindow()
  await page.setViewportSize(size)
  await stubFolderPicker(current().app, library)
  await addAndAwaitScan(page)
  await page.evaluate(() => (location.hash = '#/'))
  await expect(page.getByRole('listitem')).toHaveCount(6)
  return page
}

const viewerScale = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const transform =
      document.querySelector<HTMLImageElement>('[aria-label="Image"] img')?.style.transform ?? ''
    return Number(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? NaN)
  })

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

test('opens the original, steps with the arrow keys and shows file details', async () => {
  const page = await openLibrary()
  await page
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: /^Open / })
    .click()

  await expect(page.getByText('1 / 6')).toBeVisible()
  const width = await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('[aria-label="Image"] img')
    await img?.decode()
    return img?.naturalWidth
  })
  expect(width).toBe(1024)
  await expect(page.getByRole('complementary', { name: 'File details' })).toContainText(
    '1024 × 1024'
  )

  await page.keyboard.press('ArrowRight')
  await expect(page.getByText('2 / 6')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('1 / 6')).toBeVisible()
})

test('Escape returns to the gallery at the same scroll position', async () => {
  const page = await openLibrary({ width: 800, height: 500 })
  const scroller = page.locator('.scroller')
  await scroller.evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        element.addEventListener('scroll', () => resolve(), { once: true })
        element.scrollTop = 900
      })
  )
  const visible = page.getByRole('listitem').filter({ has: page.locator('img') })
  await visible
    .nth(2)
    .getByRole('button', { name: /^Open / })
    .click()
  await expect(page.getByRole('region', { name: 'Image' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('list', { name: 'Images' })).toBeVisible()
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(800)
})

test('wheel zooms and double-click toggles between fit and actual size', async () => {
  const page = await openLibrary()
  await page
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: /^Open / })
    .click()
  const viewer = page.getByRole('img', { name: /\.(png|webp|jpe?g)$/ })
  await expect(viewer).toBeVisible()
  const fit = await viewerScale(page)
  expect(fit).toBeLessThan(1)

  await viewer.hover()
  await page.mouse.wheel(0, -300)
  await expect.poll(() => viewerScale(page)).toBeGreaterThan(fit)

  await viewer.dblclick()
  await expect.poll(() => viewerScale(page)).toBeCloseTo(fit, 5)
  await viewer.dblclick()
  await expect.poll(() => viewerScale(page)).toBeCloseTo(1, 5)
})
