import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transformer } from '@napi-rs/image'
import { expect, test, type Page } from '@playwright/test'
import { cardNames, cards } from './support/cards'
import { addAndAwaitScan, makeLibrary, stubFolderPicker } from './support/library'
import { launchApp, type LaunchedApp } from './support/launch'
import { stubTrashAndDialogs } from './support/trash'

let launched: LaunchedApp | undefined
let library: string
let trash: string | undefined

const current = (): LaunchedApp => {
  if (!launched) throw new Error('app was not launched')
  return launched
}

test.afterEach(async () => {
  try {
    await launched?.close()
  } finally {
    rmSync(library, { recursive: true, force: true })
    if (trash) rmSync(trash, { recursive: true, force: true })
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

async function openWithCopies(): Promise<{ page: Page; originals: string[] }> {
  const originals = await libraryWithCopies()
  launched = await launchApp()
  const page = await current().app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await stubFolderPicker(current().app, library)
  await addAndAwaitScan(page)
  await awaitGroups(page, 3)
  return { page, originals }
}

test('copies are grouped as look-alikes, with badges, a groups view and a threshold', async () => {
  const { page, originals } = await openWithCopies()
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

test('trash all but keeper leaves the keeper, and a chosen keeper wins', async () => {
  const { page } = await openWithCopies()
  trash = mkdtempSync(join(tmpdir(), 'genfolio-trash-'))
  await stubTrashAndDialogs(current().app, trash, { answer: 0 })
  await page.evaluate(() => (location.hash = '#/similar'))
  const groups = page.getByRole('list', { name: 'Groups' })
  await expect(groups.getByRole('listitem')).toHaveCount(3)

  // The half-size copy has fewer pixels, so the original is the suggested keeper.
  await groups
    .getByRole('button', { name: /^Move all but the keeper/ })
    .first()
    .click()
  await expect(groups.getByRole('listitem')).toHaveCount(2)
  expect(readdirSync(trash)).toHaveLength(1)

  // In a group, the user can keep the copy instead of the suggestion.
  await groups
    .getByRole('button', { name: /^Open group/ })
    .first()
    .click()
  const bar = page.getByRole('region', { name: 'Keeper' })
  await expect(bar).toContainText('suggested')
  const names = await cardNames(page)
  const [, second] = names
  if (!second) throw new Error('the group has one image')
  await page.getByRole('button', { name: `Actions for ${second}` }).click()
  await page.getByRole('menuitem', { name: 'Keep this one' }).click()
  await expect(bar).toContainText(second)
  await bar.getByRole('button', { name: /^Move the other/ }).click()
  // The keeper is left on its own, so the group dissolves.
  await expect.poll(() => readdirSync(trash ?? '').length).toBe(2)
  await expect(cards(page)).toHaveCount(0)
  expect(readdirSync(trash)).not.toContain(second)
})
