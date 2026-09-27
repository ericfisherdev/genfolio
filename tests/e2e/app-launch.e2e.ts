import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

let app: ElectronApplication

// Set GENFOLIO_E2E_EXECUTABLE to a packaged binary (e.g. release/<ver>/linux-unpacked/genfolio)
// to run the same checks against the packaged app instead of the dev build.
const packagedExecutable = process.env['GENFOLIO_E2E_EXECUTABLE']

test.beforeEach(async () => {
  app = await electron.launch(
    packagedExecutable ? { executablePath: packagedExecutable } : { args: ['.'] }
  )
})

test.afterEach(async () => {
  await app.close()
})

test('main window reports a healthy library service', async () => {
  const window = await app.firstWindow()
  await expect(window).toHaveTitle('Genfolio')
  const status = window.getByRole('region', { name: 'Library service status' })
  await expect(status).toContainText('(FTS5)')
  await expect(status).toContainText('png, jpeg, webp, avif')
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
