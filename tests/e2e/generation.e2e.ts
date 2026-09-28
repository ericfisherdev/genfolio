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

async function openLibrary(): Promise<Page> {
  const page = await current().app.firstWindow()
  await stubFolderPicker(current().app, library)
  await addAndAwaitScan(page)
  return page
}

/** The id of the fixture image with this file name. */
function imageIdOf(page: Page, fileName: string): Promise<number> {
  return page.evaluate(async (name) => {
    const layout = await window.genfolio.getImageLayout({
      scope: { kind: 'all' },
      sort: 'newest'
    } as Parameters<typeof window.genfolio.getImageLayout>[0])
    const ids = Array.from(layout.filter((_, index) => index % 3 === 0))
    const card = (await window.genfolio.getImages(ids)).find((c) => c.fileName === name)
    if (!card) throw new Error(`${name} not in the gallery`)
    return card.id
  }, fileName)
}

const readClipboard = (): Promise<string> =>
  current().app.evaluate(({ clipboard }) => clipboard.readText())

test('serves generation details, filling an image without metadata from log.html', async () => {
  const page = await openLibrary()
  const id = await imageIdOf(page, '2026-09-27_20-47-27_2563.png')
  const details = await page.evaluate((imageId) => window.genfolio.getGeneration(imageId), id)

  expect(details).toMatchObject({ origin: 'fooocus-log', generator: 'fwd-fooocus', steps: 30 })
  expect(details?.prompt).toContain('café table')
  expect(details?.resources).toEqual([
    expect.objectContaining({ kind: 'checkpoint', name: 'intorealism_sdxlV4' }),
    expect.objectContaining({ kind: 'lora', name: 'sd_xl_dpo_lora_v1-128dim', weight: 0.5 })
  ])
})

test('copies each variant to the clipboard from main', async () => {
  const page = await openLibrary()
  const id = await imageIdOf(page, '2026-09-27_20-38-19_1754.png')
  const copy = (variant: string): Promise<boolean> =>
    page.evaluate(
      ([imageId, v]) =>
        window.genfolio.copyGeneration(
          imageId as number,
          v as Parameters<typeof window.genfolio.copyGeneration>[1]
        ),
      [id, variant] as const
    )

  expect(await copy('prompt')).toBe(true)
  const prompt = await readClipboard()
  expect(prompt).toMatch(/^a ceramic teapot .* shallow depth of field$/)

  expect(await copy('prompt-with-loras')).toBe(true)
  expect(await readClipboard()).toBe(
    `${prompt} <lora:add-detail-xl:0.6> <lora:Pony Realism Slider:1>`
  )

  expect(await copy('negative')).toBe(true)
  expect(await readClipboard()).toBe('blurry, lowres, (text:1.3), watermark, "signature"')

  expect(await copy('all')).toBe(true)
  const all = await readClipboard()
  expect(all.startsWith(`${prompt}\nNegative prompt: `)).toBe(true)
  expect(all).toContain('Model hash: c69e98fa77, Model: ultraRealisticByStable_v25')
  expect(all).toContain('Lora weights: "add-detail-xl: 0.6, Pony Realism Slider: 1"')
})

test('an image without any generation has no details and nothing to copy', async () => {
  const page = await openLibrary()
  const missing = 999_999
  expect(await page.evaluate((id) => window.genfolio.getGeneration(id), missing)).toBeNull()
  expect(
    await page.evaluate(
      (id) =>
        window.genfolio.copyGeneration(
          id,
          'all' as Parameters<typeof window.genfolio.copyGeneration>[1]
        ),
      missing
    )
  ).toBe(false)
})

test('the card copy button copies the prompt, and Shift-click copies everything', async () => {
  const page = await openLibrary()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => (location.hash = '#/'))
  const name = '2026-09-27_20-38-19_1754.png'
  const card = page.getByRole('article', { name })
  await card.hover()
  const button = card.getByRole('button', { name: `Copy prompt of ${name}` })

  await button.click()
  await expect.poll(readClipboard).toMatch(/^a ceramic teapot .* shallow depth of field$/)
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toContainText(
    'Copied the prompt.'
  )

  await button.click({ modifiers: ['Shift'] })
  await expect.poll(readClipboard).toContain('\nSteps: 30, Sampler: dpmpp_2m_sde_gpu')
})

test('the detail page shows the generation panel and copies from it', async () => {
  const page = await openLibrary()
  await page.setViewportSize({ width: 1400, height: 900 })
  const id = await imageIdOf(page, '2026-09-27_20-43-28_2563.webp')
  await page.evaluate((imageId) => (location.hash = `#/image/${imageId}`), id)

  const panel = page.getByRole('region', { name: 'Generation data' })
  await expect(panel).toContainText('intorealism_sdxlV4')
  await expect(panel).toContainText('café table')
  await expect(panel).toContainText('桜 petals')
  await expect(panel.getByRole('listitem').filter({ hasText: 'add-detail-xl' })).toContainText(
    '0.6'
  )
  await panel.getByRole('button', { name: 'Copy negative prompt' }).click()
  await expect.poll(readClipboard).toBe('blurry, lowres, (text:1.3), watermark, "signature"')
  await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toContainText(
    'Copied the negative prompt.'
  )
})

test('every fixture shows its checkpoint and an intact UTF-8 prompt on its detail page', async () => {
  const page = await openLibrary()
  await page.setViewportSize({ width: 1400, height: 900 })
  const checkpoints: Record<string, string> = {
    '2026-09-27_20-36-27_8675.png': 'ultraRealisticByStable_v25',
    '2026-09-27_20-38-19_1754.png': 'ultraRealisticByStable_v25',
    '2026-09-27_20-43-28_2563.webp': 'intorealism_sdxlV4',
    '2026-09-27_20-45-48_2563.webp': 'intorealism_sdxlV4',
    '2026-09-27_20-47-27_2563.png': 'intorealism_sdxlV4',
    '2026-09-27_20-48-56_2563.jpeg': 'intorealism_sdxlV4'
  }
  for (const [fileName, checkpoint] of Object.entries(checkpoints)) {
    const id = await imageIdOf(page, fileName)
    await page.evaluate((imageId) => (location.hash = `#/image/${imageId}`), id)
    const panel = page.getByRole('region', { name: 'Generation data' })
    await expect(panel.getByRole('listitem').first()).toContainText(checkpoint)
    // Every fixture has a log entry, so even the EXIF images whose text Fooocus mangled to
    // `caf?` show the log's UTF-8 prompt.
    await expect(panel).toContainText('café table')
    await expect(panel).toContainText('桜 petals')
  }
})
