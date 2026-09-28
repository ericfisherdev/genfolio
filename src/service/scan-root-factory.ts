import type Database from 'better-sqlite3'
import { FooocusLogIndexer } from '@application/fooocus-log-indexer'
import { ImageMetadataIndex } from '@application/image-metadata-index'
import { DEFAULT_SCAN_OPTIONS, ScanRoot, type ScanRootOptions } from '@application/scan-root'
import { GenerationMerger } from '@domain/generation-merger'
import type { DirectoryRepository, ImageRepository } from '@domain/repositories'
import type { ScanLogger } from '@domain/scan'
import { SqliteFooocusLogRepository } from '@infrastructure/db/repositories/sqlite-fooocus-log-repository'
import { SqliteGenerationRepository } from '@infrastructure/db/repositories/sqlite-generation-repository'
import { SqliteImageVersionCheck } from '@infrastructure/db/repositories/sqlite-image-version-check'
import { SqliteMetadataRecordRepository } from '@infrastructure/db/repositories/sqlite-metadata-record-repository'
import { SqliteModelCatalog } from '@infrastructure/db/repositories/sqlite-model-catalog'
import { SqliteTransactionRunner } from '@infrastructure/db/sqlite-transaction-runner'
import { NodeFileWalker } from '@infrastructure/fs/node-file-walker'
import { NodeLogFileSource } from '@infrastructure/fs/node-log-file-source'
import { ImageSizeHeaderReader } from '@infrastructure/imaging/image-size-header-reader'
import { FooocusLogParser } from '@infrastructure/metadata/fooocus-log-parser'
import { MetadataRecordReader } from '@infrastructure/metadata/metadata-record-reader'
import { A1111InfotextParser } from '@infrastructure/metadata/parsers/a1111-infotext-parser'
import { FooocusJsonParser } from '@infrastructure/metadata/parsers/fooocus-json-parser'
import { GenerationRecordParser } from '@infrastructure/metadata/parsers/generation-record-parser'
import { UnFooocusedParser } from '@infrastructure/metadata/parsers/unfooocused-parser'

export interface ScanRootCollaborators {
  readonly directories: DirectoryRepository
  readonly images: ImageRepository
  readonly logger: ScanLogger
  readonly fileRef: (path: string) => string
  readonly now: () => number
}

/** The metadata side of indexing: raw records in, merged generations stored. */
export function createImageMetadataIndex(db: Database.Database): ImageMetadataIndex {
  const versions = new SqliteImageVersionCheck(db)
  return new ImageMetadataIndex(
    // Most specific formats first: JSON, then UnFooocused's two-line text, then A1111.
    new GenerationRecordParser([
      new FooocusJsonParser(),
      new UnFooocusedParser(),
      new A1111InfotextParser()
    ]),
    new GenerationMerger(),
    new SqliteMetadataRecordRepository(db, versions),
    new SqliteGenerationRepository(db, new SqliteModelCatalog(db), versions)
  )
}

/** A scanner that indexes files, their embedded metadata and Fooocus logs into `db`. */
export function createScanRoot(
  db: Database.Database,
  collaborators: ScanRootCollaborators,
  options: ScanRootOptions = DEFAULT_SCAN_OPTIONS
): ScanRoot {
  const { directories, images, logger, fileRef, now } = collaborators
  const metadata = createImageMetadataIndex(db)
  const transactions = new SqliteTransactionRunner(db)
  const logs = new FooocusLogIndexer({
    directories,
    images,
    logs: new SqliteFooocusLogRepository(db),
    files: new NodeLogFileSource(),
    format: new FooocusLogParser(),
    metadata,
    transactions
  })
  return new ScanRoot(
    {
      walker: new NodeFileWalker(logger, fileRef),
      headerReader: new ImageSizeHeaderReader(),
      directories,
      images,
      metadataReader: new MetadataRecordReader(),
      metadata,
      logs,
      transactions,
      logger,
      fileRef,
      now
    },
    options
  )
}
