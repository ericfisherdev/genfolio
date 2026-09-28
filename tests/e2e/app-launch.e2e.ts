import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { migrations } from '../../src/infrastructure/db/migrations'
import { launchApp, packagedExecutable, type LaunchedApp } from './support/launch'

let launched: LaunchedApp | undefined

/** The app launched for the current test; beforeEach guarantees it. */
const current = (): LaunchedApp => {
  if (!launched) throw new Error('app was not launched')
  return launched
}

test.beforeEach(async () => {
  launched = undefined
  launched = await launchApp()
})

test.afterEach(async () => {
  await launched?.close()
})

test('main window reports a healthy library service', async () => {
  const window = await current().app.firstWindow()
  await expect(window).toHaveTitle('Genfolio')
  await window.getByText('Library service', { exact: true }).click()
  const status = window.getByRole('region', { name: 'Library service status' })
  await expect(status).toContainText('(FTS5)')
  await expect(status).toContainText('png, jpeg, webp, avif')
  await expect(status).toContainText(`v${migrations.length}`)
  expect(existsSync(join(current().userData, 'genfolio.db'))).toBe(true)
})

test('renderer has no Node.js access', async () => {
  const window = await current().app.firstWindow()
  const exposure = await window.evaluate(() => ({
    require: typeof (globalThis as Record<string, unknown>)['require'],
    process: typeof (globalThis as Record<string, unknown>)['process'],
    genfolio: typeof (globalThis as Record<string, unknown>)['genfolio']
  }))
  expect(exposure).toEqual({ require: 'undefined', process: 'undefined', genfolio: 'object' })
})

test('a second launch on the same userData exits and leaves the first running', async () => {
  const { app, env } = current()
  await app.firstWindow()
  const executable = packagedExecutable ?? (await app.evaluate(() => process.execPath))
  const second = spawnSync(executable, packagedExecutable ? [] : ['.'], {
    env,
    timeout: 20_000
  })
  expect(second.error).toBeUndefined()
  expect(second.status).toBe(0)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})
