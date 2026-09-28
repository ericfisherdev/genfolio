import { readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Transformer } from '@napi-rs/image'
import { expect, test, type Page } from '@playwright/test'
import { addAndAwaitScan, makeLibrary, stubFolderPicker } from './support/library'
import { launchApp, type LaunchedApp } from './support/launch'

let launched: LaunchedApp | undefined
let library: string
let page: Page

interface LoadResult {
  readonly loaded: boolean
  readonly width: number
}

/** Loads `url` into an <img> in the renderer and reports its natural width. */
function loadImage(url: string): Promise<LoadResult> {
  return page.evaluate(
    (src) =>
      new Promise<LoadResult>((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ loaded: true, width: img.naturalWidth })
        img.onerror = () => resolve({ loaded: false, width: 0 })
        img.src = src
      }),
    url
  )
}

/** Image id by file name, from the renderer API. */
async function idOf(fileName: string): Promise<number> {
  return page.evaluate(async (name) => {
    const layout = await window.genfolio.getImageLayout({
      scope: { kind: 'all' },
      sort: 'file-name'
    } as Parameters<typeof window.genfolio.getImageLayout>[0])
    const ids = Array.from(layout.filter((_, index) => index % 3 === 0))
    const card = (await window.genfolio.getImages(ids)).find((c) => c.fileName === name)
    if (!card) throw new Error(`${name} not indexed`)
    return card.id
  }, fileName)
}

function webpFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((name) =>
    name.endsWith('.webp')
  )
}

test.beforeEach(async () => {
  launched = undefined
  library = makeLibrary()
  const large = await Transformer.fromRgbaPixels(
    new Uint8Array(4096 * 4096 * 4).fill(120),
    4096,
    4096
  ).png()
  writeFileSync(join(library, 'large.png'), large)
  writeFileSync(join(library, 'secret.txt'), 'outside the image set')
  launched = await launchApp()
  page = await launched.app.firstWindow()
  await stubFolderPicker(launched.app, library)
  await addAndAwaitScan(page)
})

test.afterEach(async () => {
  try {
    await launched?.close()
  } finally {
    rmSync(library, { recursive: true, force: true })
  }
})

test('serves originals, and a 600 px in-memory copy for large images in grid mode', async () => {
  const fixture = readdirSync(join(library, '2026-09-27')).find((name) => name.endsWith('.png'))
  const smallId = await idOf(fixture as string)
  const largeId = await idOf('large.png')
  const webpBefore = [...webpFilesUnder(launched!.userData), ...webpFilesUnder(library)]

  expect(await loadImage(`genfolio://img/${smallId}`)).toEqual({ loaded: true, width: 1024 })
  expect(await loadImage(`genfolio://img/${smallId}?display=grid`)).toEqual({
    loaded: true,
    width: 1024
  })
  expect(await loadImage(`genfolio://img/${largeId}?display=grid`)).toEqual({
    loaded: true,
    width: 600
  })
  expect(await loadImage(`genfolio://img/${largeId}`)).toEqual({ loaded: true, width: 4096 })
  expect([...webpFilesUnder(launched!.userData), ...webpFilesUnder(library)]).toEqual(webpBefore)
})

test('refuses unknown ids, traversal and files swapped for symlinks leaving the root', async () => {
  const fixture = readdirSync(join(library, '2026-09-27')).find((name) => name.endsWith('.png'))
  const path = join(library, '2026-09-27', fixture as string)
  const id = await idOf(fixture as string)
  expect(readFileSync(path).length).toBeGreaterThan(0)

  for (const url of [
    'genfolio://img/999999',
    'genfolio://img/..%2F..%2Fetc%2Fpasswd',
    'genfolio://img/%2Fetc%2Fpasswd'
  ]) {
    expect(await loadImage(url)).toEqual({ loaded: false, width: 0 })
  }

  unlinkSync(path)
  symlinkSync('/etc/hostname', path)
  expect(await loadImage(`genfolio://img/${id}`)).toEqual({ loaded: false, width: 0 })
})

test('the renderer has a strict CSP and no browser permissions', async () => {
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')
  expect(csp).toContain("base-uri 'none'")
  expect(csp).toContain("object-src 'none'")
  expect(await page.evaluate(() => Notification.requestPermission())).toBe('denied')
})
