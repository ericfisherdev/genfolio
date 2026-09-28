import { MigrationError } from '@infrastructure/db/migration-runner'

/** A message the user can act on when the library database cannot be opened. */
export function startupFailureReason(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  if (error instanceof MigrationError) {
    return `The library database cannot be used by this version of Genfolio (${detail}). Update Genfolio to open it.`
  }
  return `The library database could not be opened: ${detail}`
}
