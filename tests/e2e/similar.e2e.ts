import { copyFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Transformer } from '@napi-rs/image'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { addAndAwaitScan, makeLibrary, stubFolderPicker } from './support/library'
import { launchApp, type LaunchedApp } from './support/launch'

let launched: LaunchedApp | undefined
let library: string

const current = (): LaunchedApp => {
  if (!launched) throw new Error('app was not launched')
  return launched
}

test.afterEach(async () => {
  try {
    await launched?.close()
  } finally {
    rmSync(library, { recursive: true, force: true })
  }
})

/**
 * The fixtures plus three copies: the first byte for byte, the second at half size and
 * re-encoded as JPEG (both hash the same as the original), the third cropped by 2% (a few
 * bits away). Returns the originals' names in that order.
 */
async function libraryWithCopies(): Promise<string[]> {
  library = makeLibrary()
  const day = join(library, '2026-09-27')
  const originals = readdirSync(day)
    .filter((name) => name.endsWith('.png'))
    .sort()
    .slice(0, 3)
  const [exact, small, cropped] = originals.map((name) => join(day, name))
  if (!exact || !small || !cropped) throw new Error('not enough fixtures')
  copyFileSync(exact, join(day, 'copy-exact.png'))
  const smallBytes = readFileSync(small)
  const { width } = await new Transformer(smallBytes).metadata()
  writeFileSync(
    join(day, 'copy-small.jpg'),
    await new Transformer(smallBytes).resize({ width: Math.round(width / 2) }).jpeg(80)
  )
  const croppedBytes = readFileSync(cropped)
  const size = await new Transformer(croppedBytes).metadata()
  const [dx, dy] = [Math.round(size.width / 50), Math.round(size.height / 50)]
  writeFileSync(
    join(day, 'copy-cropped.png'),
    await new Transformer(croppedBytes).crop(dx, dy, size.width - dx, size.height - dy).png()
  )
  return originals
}

const cards = (page: Page): Locator =>
  page.getByRole('list', { name: 'Images' }).getByRole('listitem')

/** Waits for hashing and grouping to settle at `groups` groups. */
async function awaitGroups(page: Page, groups: number): Promise<void> {
  await expect
    .poll(
      () => page.evaluate(async () => (await window.genfolio.listSimilarGroups(0, 100)).total),
      {
        timeout: 20_000
      }
    )
    .toBe(groups)
}

test('copies are grouped as look-alikes, with badges, a groups view and a threshold', async () => {
  const originals = await libraryWithCopies()
  launched = await launchApp()
  const page = await current().app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await stubFolderPicker(current().app, library)
  await addAndAwaitScan(page)
  await awaitGroups(page, 3)
  await page.evaluate(() => (location.hash = '#/'))
  await expect(cards(page)).toHaveCount(9)

  const badge = page.getByRole('button', { name: `1 look-alike of ${originals[0]}` })
  await expect(badge).toBeVisible()
  await badge.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Look-alikes' })).toBeVisible()
  await expect(cards(page)).toHaveCount(2)

  await page.getByRole('button', { name: /^Look-alikes/ }).click()
  const groups = page.getByRole('list', { name: 'Groups' })
  await expect(groups.getByRole('listitem')).toHaveCount(3)

  // At 0 bits the cropped copy is no longer a look-alike; the other two hash the same.
  const slider = page.getByRole('slider', { name: 'Threshold' })
  await slider.fill('0')
  await expect(groups.getByRole('listitem')).toHaveCount(2)
  await page.getByRole('button', { name: /^All Photos/ }).click()
  await expect(page.getByRole('button', { name: `1 look-alike of ${originals[1]}` })).toBeVisible()
  await expect(page.getByRole('button', { name: `1 look-alike of ${originals[2]}` })).toHaveCount(0)
})
