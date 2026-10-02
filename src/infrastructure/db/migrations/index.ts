import { libraryMigration } from './001-library'
import { fileNameNocaseIndexMigration } from './002-file-name-nocase-index'
import { generationsMigration } from './003-generations'
import { metadataVersionMigration } from './004-metadata-version'
import { promptSearchMigration } from './005-prompt-search'
import { userDataMigration } from './006-user-data'
import { similarityMigration } from './007-similarity'
import { modelInfoMigration } from './008-model-info'
import type { Migration } from './migration'

/** Every schema migration, oldest first. Append new ones; never edit shipped ones. */
export const migrations: readonly Migration[] = [
  libraryMigration,
  fileNameNocaseIndexMigration,
  generationsMigration,
  metadataVersionMigration,
  promptSearchMigration,
  userDataMigration,
  similarityMigration,
  modelInfoMigration
]
