/**
 * Test-only userData location: honoured only when `GENFOLIO_E2E=1`, so e2e runs never
 * touch the real library database.
 */
export function e2eUserDataOverride(env: NodeJS.ProcessEnv): string | undefined {
  const override = env['GENFOLIO_USER_DATA']
  return env['GENFOLIO_E2E'] === '1' && override ? override : undefined
}
