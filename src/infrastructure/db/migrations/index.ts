import { libraryMigration } from './001-library'
import { fileNameNocaseIndexMigration } from './002-file-name-nocase-index'
import type { Migration } from './migration'

/** Every schema migration, oldest first. Append new ones; never edit shipped ones. */
export const migrations: readonly Migration[] = [libraryMigration, fileNameNocaseIndexMigration]
