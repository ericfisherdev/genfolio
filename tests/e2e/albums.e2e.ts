import { rmSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
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

/** Rescans every root and waits for the scans to finish. */
function rescanAll(page: Page): Promise<void> {
  return page.evaluate(async () => {
    const roots = await window.genfolio.listRoots()
    await Promise.all(
      roots.map(
        (root) =>
          new Promise<void>((resolve) => {
            const off = window.genfolio.onScanEvent((event) => {
              if (
                (event.type === 'finished' || event.type === 'failed') &&
                event.rootId === root.id
              ) {
                off()
                resolve()
              }
            })
            void window.genfolio.rescanRoot(root.id)
          })
      )
    )
  })
}

test('a manual album is filled, arranged, kept through a rescan, renamed and deleted', async () => {
  const page = await openGallery()
  const names = await cardNames(page)
  const [first, second, third] = names

  // Create from the sidebar; the new album opens empty.
  await page.getByRole('button', { name: 'New album' }).click()
  const create = page.getByRole('dialog', { name: 'New album' })
  await create.getByRole('textbox').fill('Trip')
  await create.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Trip' })).toBeVisible()
  await expect(page.getByText('This album is empty.')).toBeVisible()

  // Select three images in the library and add them.
  await page.getByRole('button', { name: /^All Photos/ }).click()
  await expect(cards(page)).toHaveCount(6)
  for (const name of [first, second, third]) {
    await page.getByRole('checkbox', { name: `Select ${name}` }).click()
  }
  await page.getByRole('button', { name: 'Add to album…' }).click()
  const picker = page.getByRole('dialog', { name: 'Add 3 images to an album' })
  await picker.getByRole('combobox', { name: 'Album' }).fill('Trip')
  await picker.getByRole('combobox', { name: 'Album' }).press('Enter')
  await expect(
    page.getByRole('status').filter({ hasText: 'Added 3 images to “Trip”.' })
  ).toBeVisible()

  const albums = page.getByRole('list', { name: 'Albums' })
  await albums.getByRole('button', { name: /^Trip/ }).click()
  await expect(cards(page)).toHaveCount(3)
  expect(await cardNames(page)).toEqual([first, second, third])

  // Keyboard-reachable arranging from the card menu.
  await page.getByRole('button', { name: `Actions for ${third}` }).click()
  await page.getByRole('menuitem', { name: 'Move to start' }).click()
  await expect.poll(() => cardNames(page)).toEqual([third, first, second])

  // Dragging the first card onto the far half of the last one moves it to the end.
  // Explicit steps: a native drag starts only after the pointer moves with the button down,
  // and a busy page can miss a single move, so the target is entered twice.
  const fromBox = await cards(page).first().boundingBox()
  const toBox = await cards(page).last().boundingBox()
  if (!fromBox || !toBox) throw new Error('no box for a card')
  const dropX = toBox.x + toBox.width * 0.9
  const dropY = toBox.y + toBox.height / 2
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(dropX - 10, dropY, { steps: 5 })
  await page.mouse.move(dropX, dropY, { steps: 5 })
  await expect(cards(page).last()).toHaveClass(/drop-after/)
  await page.mouse.up()
  await expect.poll(() => cardNames(page)).toEqual([first, second, third])

  // Membership and order survive a rescan.
  await rescanAll(page)
  await expect.poll(() => cardNames(page)).toEqual([first, second, third])

  await page.getByRole('button', { name: `Actions for ${second}` }).click()
  await page.getByRole('menuitem', { name: 'Remove from album' }).click()
  await expect(cards(page)).toHaveCount(2)
  await expect(albums.getByRole('button', { name: /^Trip/ })).toContainText('2')

  await page.getByRole('button', { name: 'Actions for album Trip' }).click()
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  const rename = page.getByRole('dialog', { name: 'Rename album' })
  await rename.getByRole('textbox').fill('Holiday')
  await rename.getByRole('button', { name: 'Rename' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Holiday' })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for album Holiday' }).click()
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  await page
    .getByRole('dialog', { name: /^Delete the album/ })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'All Photos' })).toBeVisible()
  await expect(cards(page)).toHaveCount(6)
  await expect(page.getByRole('list', { name: 'Albums' })).toHaveCount(0)
})

test('a smart album saves a search and re-evaluates it when opened', async () => {
  const page = await openGallery()
  const [first, second] = await cardNames(page)
  const favourite = (name: string | undefined): Promise<void> =>
    page.getByRole('button', { name: `Favourite ${name}` }).click()

  await favourite(first)
  await page.getByRole('button', { name: '♥ Favourites' }).click()
  await expect(cards(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Save as smart album…' }).click()
  const save = page.getByRole('dialog', { name: 'Save as smart album' })
  await save.getByRole('textbox').fill('Faves')
  await save.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Faves' })).toBeVisible()
  await expect(cards(page)).toHaveCount(1)

  // Marking another favourite in the library puts it in the album on the next open.
  await page.getByRole('button', { name: /^All Photos/ }).click()
  await expect(cards(page)).toHaveCount(6)
  await favourite(second)
  const albums = page.getByRole('list', { name: 'Albums' })
  await albums.getByRole('button', { name: /^Smart album Faves/ }).click()
  await expect(cards(page)).toHaveCount(2)
  await expect(albums.getByRole('button', { name: /^Smart album Faves/ })).toContainText('2')
})
