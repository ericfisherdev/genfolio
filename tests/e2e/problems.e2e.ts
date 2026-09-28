import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { addAndAwaitScan, makeLibrary, stubFolderPicker } from './support/library'
import { launchApp, type LaunchedApp } from './support/launch'

let launched: LaunchedApp | undefined
let library: string

test.afterEach(async () => {
  try {
    await launched?.close()
  } finally {
    rmSync(library, { recursive: true, force: true })
  }
})

test('an unreadable image is reported with a way to the logs, which hold no paths', async () => {
  library = makeLibrary()
  writeFileSync(join(library, '2026-09-27', 'broken.png'), 'not an image')
  launched = await launchApp()
  const app = launched.app
  const page = await app.firstWindow()
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { openedPaths?: string[] }).openedPaths = opened
    shell.openPath = async (path: string) => {
      opened.push(path)
      return ''
    }
  })
  await stubFolderPicker(app, library)
  await addAndAwaitScan(page)

  const notice = page.getByRole('status').filter({ hasText: '1 file could not be read as images.' })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'Open logs' }).click()
  const logs = join(launched.userData, 'logs')
  await expect
    .poll(() => app.evaluate(() => (globalThis as { openedPaths?: string[] }).openedPaths ?? []))
    .toEqual([logs])

  await expect.poll(() => existsSync(join(logs, 'service.log'))).toBe(true)
  const text = readdirSync(logs)
    .map((name) => readFileSync(join(logs, name), 'utf8'))
    .join('\n')
  expect(text).toContain('Skipping image')
  expect(text).not.toContain(library)
})
