import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Transformer } from '@napi-rs/image'
import { expect, test, type Page } from '@playwright/test'
import { addAndAwaitScan, makeLibrary, stubFolderPicker } from './support/library'
import { launchApp, type LaunchedApp } from './support/launch'

let launched: LaunchedApp | undefined
let library: string

const current = (): LaunchedApp => {
  if (!launched) throw new Error('app was not launched')
  return launched
}

async function openLibrary(): Promise<Page> {
  const page = await current().app.firstWindow()
  await page.setViewportSize({ width: 1280, height: 800 })
  await stubFolderPicker(current().app, library)
  await addAndAwaitScan(page)
  await page.evaluate(() => (location.hash = '#/'))
  return page
}

/** Natural widths of the images currently mounted in the grid, once they have loaded. */
function loadedWidths(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('[role="list"] img'))
    await Promise.all(images.map((img) => img.decode().catch(() => undefined)))
    return images.map((img) => img.naturalWidth)
  })
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

test('shows every image as a card; large images arrive as 600 px copies', async () => {
  const large = await Transformer.fromRgbaPixels(
    new Uint8Array(3000 * 2000 * 4).fill(90),
    3000,
    2000
  ).png()
  writeFileSync(join(library, 'large.png'), large)
  const page = await openLibrary()

  await expect(page.getByRole('listitem')).toHaveCount(7)
  const widths = await loadedWidths(page)
  expect(widths.filter((width) => width === 1024)).toHaveLength(6)
  expect(widths.filter((width) => width === 600)).toHaveLength(1)
})

test('the card menu copies the path and reveals the file', async () => {
  const page = await openLibrary()
  await current().app.evaluate(({ shell }) => {
    ;(globalThis as Record<string, unknown>)['revealed'] = []
    shell.showItemInFolder = (path: string) =>
      ((globalThis as Record<string, unknown>)['revealed'] as string[]).push(path)
  })
  const card = page.getByRole('listitem').first()
  await card.hover()

  await card.getByRole('button', { name: /^Actions for / }).click()
  await page.getByRole('menuitem', { name: 'Copy path' }).click()
  await expect
    .poll(() => current().app.evaluate(({ clipboard }) => clipboard.readText()))
    .toContain(join(library, '2026-09-27'))

  await card.getByRole('button', { name: /^Actions for / }).click()
  await page.getByRole('menuitem', { name: 'Show in folder' }).click()
  await expect
    .poll(() =>
      current().app.evaluate(() => (globalThis as Record<string, unknown>)['revealed'] as string[])
    )
    .toHaveLength(1)
})

test('columns follow the window width without horizontal overflow', async () => {
  const page = await openLibrary()
  const overflow = (): Promise<number> =>
    page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('[role="list"]')?.closest('.scroller')
      return scroller ? scroller.scrollWidth - scroller.clientWidth : -1
    })
  const columns = (): Promise<number> =>
    page.evaluate(
      () =>
        new Set(
          Array.from(document.querySelectorAll<HTMLElement>('[role="listitem"]')).map(
            (slot) => slot.style.transform.split(',')[0]
          )
        ).size
    )
  await page.setViewportSize({ width: 1600, height: 800 })
  await expect.poll(columns).toBeGreaterThanOrEqual(3)
  expect(await overflow()).toBe(0)
  await page.setViewportSize({ width: 800, height: 800 })
  await expect.poll(columns).toBe(1)
  expect(await overflow()).toBe(0)
})

test('clicking a card opens its image route', async () => {
  const page = await openLibrary()
  await page
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: /^Open / })
    .click()
  expect(await page.evaluate(() => location.hash)).toMatch(/^#\/image\/\d+$/)
})

test.describe(() => {
  test.skip(process.env['GENFOLIO_PERF'] !== '1', 'set GENFOLIO_PERF=1')
  test.setTimeout(300_000)

  test('10k images: no layout shift, bounded cards and memory while scrolling', async () => {
    // Solid-colour 832×1216 PNG: a few KB on disk, but the same decoded size as a real one.
    const source = join(library, 'bulk-source.png')
    writeFileSync(
      source,
      await Transformer.fromRgbaPixels(new Uint8Array(832 * 1216 * 4).fill(60), 832, 1216).png()
    )
    for (let folder = 0; folder < 20; folder++) {
      const dir = join(library, 'bulk', String(folder))
      mkdirSync(dir, { recursive: true })
      for (let i = 0; i < 500; i++) copyFileSync(source, join(dir, `${i}.png`))
    }
    const page = await openLibrary()
    await expect(page.getByRole('button', { name: /All Photos/ })).toContainText('10,007')

    let peakMounted = 0
    let peakMemoryMb = 0
    for (let step = 0; step < 40; step++) {
      const before = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[role="listitem"]')).map(
          (slot) => slot.getBoundingClientRect().height
        )
      )
      await loadedWidths(page)
      const after = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[role="listitem"]')).map(
          (slot) => slot.getBoundingClientRect().height
        )
      )
      expect(after).toEqual(before)
      peakMounted = Math.max(peakMounted, after.length)
      const memory = await current().app.evaluate(({ app, BrowserWindow }) => {
        const pid = BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId()
        return app.getAppMetrics().find((metric) => metric.pid === pid)?.memory.workingSetSize ?? 0
      })
      peakMemoryMb = Math.max(peakMemoryMb, memory / 1024)
      await page.mouse.wheel(0, 4000)
    }
    console.info(
      `[perf] peak mounted cards ${peakMounted}, peak renderer ${peakMemoryMb.toFixed(0)} MB`
    )
    expect(peakMounted).toBeLessThanOrEqual(60)
    expect(peakMemoryMb).toBeLessThan(1024)
  })
})
