import { libraryMigration } from './001-library'
import type { Migration } from './migration'

/** Every schema migration, oldest first. Append new ones; never edit shipped ones. */
export const migrations: readonly Migration[] = [libraryMigration]
