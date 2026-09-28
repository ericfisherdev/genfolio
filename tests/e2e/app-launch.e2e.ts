import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

let app: ElectronApplication
let userData: string

// Set GENFOLIO_E2E_EXECUTABLE to a packaged binary (e.g. release/<ver>/linux-unpacked/genfolio)
// to run the same checks against the packaged app instead of the dev build.
const packagedExecutable = process.env['GENFOLIO_E2E_EXECUTABLE']

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'genfolio-e2e-'))
  const env = { ...process.env, GENFOLIO_E2E: '1', GENFOLIO_USER_DATA: userData }
  app = await electron.launch(
    packagedExecutable ? { executablePath: packagedExecutable, env } : { args: ['.'], env }
  )
})

test.afterEach(async () => {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test('main window reports a healthy library service', async () => {
  const window = await app.firstWindow()
  await expect(window).toHaveTitle('Genfolio')
  const status = window.getByRole('region', { name: 'Library service status' })
  await expect(status).toContainText('(FTS5)')
  await expect(status).toContainText('png, jpeg, webp, avif')
  await expect(status).toContainText('v1')
  expect(existsSync(join(userData, 'genfolio.db'))).toBe(true)
})

test('renderer has no Node.js access', async () => {
  const window = await app.firstWindow()
  const exposure = await window.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    genfolio: typeof (globalThis as Record<string, unknown>)['genfolio']
  }))
  expect(exposure).toEqual({ require: 'undefined', process: 'undefined', genfolio: 'object' })
})
