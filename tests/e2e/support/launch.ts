import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication } from '@playwright/test'

/**
 * Set GENFOLIO_E2E_EXECUTABLE to a packaged binary (e.g. release/<ver>/linux-unpacked/genfolio)
 * to run the suite against the packaged app instead of the dev build.
 */
export const packagedExecutable = process.env['GENFOLIO_E2E_EXECUTABLE']

export interface LaunchedApp {
  readonly app: ElectronApplication
  readonly userData: string
  readonly env: NodeJS.ProcessEnv
  /** Closes the app and removes its userData unless `keepUserData` is set (for relaunching). */
  close(options?: { keepUserData?: boolean }): Promise<void>
}

/** Creates a fresh temporary userData directory, for tests that prepare it before launch. */
export function tempUserData(): string {
  return mkdtempSync(join(tmpdir(), 'genfolio-e2e-'))
}

/**
 * Launches Genfolio against an isolated userData directory, removed on close, or right away
 * when the launch itself fails.
 */
export async function launchApp(userData = tempUserData()): Promise<LaunchedApp> {
  const env = { ...process.env, GENFOLIO_E2E: '1', GENFOLIO_USER_DATA: userData }
  const stringEnv = env as Record<string, string>
  let app: ElectronApplication
  try {
    app = await electron.launch(
      packagedExecutable
        ? { executablePath: packagedExecutable, env: stringEnv }
        : { args: ['.'], env: stringEnv }
    )
  } catch (error) {
    rmSync(userData, { recursive: true, force: true })
    throw error
  }
  return {
    app,
    userData,
    env,
    close: async (options) => {
      await app.close()
      if (!options?.keepUserData) rmSync(userData, { recursive: true, force: true })
    }
  }
}
