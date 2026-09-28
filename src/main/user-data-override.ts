import { join } from 'node:path'

/**
 * Test-only userData location: honoured only when `GENFOLIO_E2E=1`, so e2e runs never
 * touch the real library database.
 */
export function e2eUserDataOverride(env: NodeJS.ProcessEnv): string | undefined {
  const override = env['GENFOLIO_USER_DATA']
  return env['GENFOLIO_E2E'] === '1' && override ? override : undefined
}

/** Where unpackaged (development) builds keep their library, beside the installed app's. */
export const DEV_USER_DATA_DIR = 'Genfolio-dev'

/**
 * The userData folder to use instead of Electron's default, if any: the e2e override first;
 * otherwise an unpackaged build (`npm run dev`, `npm start`) gets its own folder, so it never
 * opens, migrates or locks the library of an installed Genfolio. Packaged builds keep the
 * default (`~/.config/Genfolio`).
 */
export function userDataLocation(
  env: NodeJS.ProcessEnv,
  packaged: boolean,
  appDataDir: string
): string | undefined {
  return e2eUserDataOverride(env) ?? (packaged ? undefined : join(appDataDir, DEV_USER_DATA_DIR))
}
