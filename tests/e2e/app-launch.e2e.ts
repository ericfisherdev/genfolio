import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp, packagedExecutable, type LaunchedApp } from './support/launch'

let launched: LaunchedApp

test.beforeEach(async () => {
  launched = await launchApp()
})

test.afterEach(async () => {
  await launched.close()
})

test('main window reports a healthy library service', async () => {
  const window = await launched.app.firstWindow()
  await expect(window).toHaveTitle('Genfolio')
  const status = window.getByRole('region', { name: 'Library service status' })
  await expect(status).toContainText('(FTS5)')
  await expect(status).toContainText('png, jpeg, webp, avif')
  await expect(status).toContainText('v1')
  expect(existsSync(join(launched.userData, 'genfolio.db'))).toBe(true)
})

test('renderer has no Node.js access', async () => {
  const window = await launched.app.firstWindow()
  const exposure = await window.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    genfolio: typeof (globalThis as Record<string, unknown>)['genfolio']
  }))
  expect(exposure).toEqual({ require: 'undefined', process: 'undefined', genfolio: 'object' })
})

test('a second launch on the same userData exits and leaves the first running', async () => {
  const { app } = launched
  await app.firstWindow()
  const executable = packagedExecutable ?? (await app.evaluate(() => process.execPath))
  const second = spawnSync(executable, packagedExecutable ? [] : ['.'], {
    env: launched.env,
    timeout: 20_000
  })
  expect(second.error).toBeUndefined()
  expect(second.status).toBe(0)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})
