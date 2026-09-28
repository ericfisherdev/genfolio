import { Transformer } from '@napi-rs/image'
import type Database from 'better-sqlite3'
import { open, realpath, stat } from 'node:fs/promises'
import { ByteLruCache } from '@application/byte-lru-cache'
import { ConcurrencyLimiter } from '@application/concurrency-limiter'
import { DisplayCopies } from '@application/display-copies'
import { fileRef } from '@application/file-ref'
import { ImageFileResolver } from '@application/image-file-resolver'
import { LibraryRoots } from '@application/library-roots'
import { GenerationDetailsReader } from '@application/generation-details-reader'
import { ScanCoordinator } from '@application/scan-coordinator'
import { generationText } from '@domain/generation-text'
import type { ImageId, RootId } from '@domain/library'
import type { ScanLogger } from '@domain/scan'
import { SqliteDirectoryRepository } from '@infrastructure/db/repositories/sqlite-directory-repository'
import { SqliteGenerationRepository } from '@infrastructure/db/repositories/sqlite-generation-repository'
import { SqliteImageVersionCheck } from '@infrastructure/db/repositories/sqlite-image-version-check'
import { SqliteMetadataRecordRepository } from '@infrastructure/db/repositories/sqlite-metadata-record-repository'
import { SqliteModelCatalog } from '@infrastructure/db/repositories/sqlite-model-catalog'
import { SqliteImageRepository } from '@infrastructure/db/repositories/sqlite-image-repository'
import { SqliteLibraryRootRepository } from '@infrastructure/db/repositories/sqlite-library-root-repository'
import { SqliteGalleryReader } from '@infrastructure/db/sqlite-gallery-reader'
import { SqliteImageLocator } from '@infrastructure/db/sqlite-image-locator'
import { NapiImageResizer } from '@infrastructure/imaging/napi-image-resizer'
import { NodeDirectoryResolver } from '@infrastructure/fs/node-directory-resolver'
import type { ScanEvent } from '@shared/scan'
import { ServiceMethod } from '@shared/service-contract'
import { HealthReporter } from './health/health-reporter'
import { ImageCodecProbe } from './health/image-codec-probe'
import { RuntimeProbe } from './health/runtime-probe'
import { SqliteProbe } from './health/sqlite-probe'
import type { ServiceHandlers } from './rpc-dispatcher'
import { createGenerationParser, createScanRoot } from './scan-root-factory'

/** In-memory budget for grid copies of large images (never written to disk). */
const DISPLAY_COPY_CACHE_BYTES = 200 * 1024 * 1024
/** Matches the default libuv thread pool that runs @napi-rs/image work. */
const DISPLAY_COPY_CONCURRENCY = 4

const scanLogger: ScanLogger = {
  warn: (message, ref) => console.warn(`[library-service] ${message} (file ${ref})`)
}

/** Builds every service handler over an open, migrated library database. */
export function createLibraryHandlers(
  db: Database.Database,
  emit: (event: ScanEvent) => void
): ServiceHandlers {
  const now = (): number => Date.now()
  const directories = new SqliteDirectoryRepository(db)
  const images = new SqliteImageRepository(db)
  const scanner = createScanRoot(db, { directories, images, logger: scanLogger, fileRef, now })
  const roots = new LibraryRoots({
    roots: new SqliteLibraryRootRepository(db),
    directories,
    images,
    scans: new ScanCoordinator(scanner, emit),
    resolver: new NodeDirectoryResolver(),
    transact: (work) => db.transaction(work)(),
    now
  })
  const gallery = new SqliteGalleryReader(db)
  const versions = new SqliteImageVersionCheck(db)
  const generationDetails = new GenerationDetailsReader(
    new SqliteGenerationRepository(db, new SqliteModelCatalog(db), versions),
    new SqliteMetadataRecordRepository(db, versions),
    createGenerationParser()
  )
  const displayCopies = new DisplayCopies(
    new ImageFileResolver(new SqliteImageLocator(db), {
      open: (path) => open(path, 'r'),
      realpath,
      stat
    }),
    new NapiImageResizer(),
    new ByteLruCache<string>(DISPLAY_COPY_CACHE_BYTES),
    new ConcurrencyLimiter(DISPLAY_COPY_CONCURRENCY)
  )
  const health = new HealthReporter([
    new RuntimeProbe(process.versions),
    new SqliteProbe(db),
    new ImageCodecProbe(Transformer)
  ])

  return {
    [ServiceMethod.Health]: () => health.report(),
    [ServiceMethod.ListRoots]: async () => roots.list(),
    [ServiceMethod.AddRoot]: ({ path }) => roots.add(path),
    [ServiceMethod.RemoveRoot]: async ({ rootId }) => ({
      removed: await roots.remove(rootId as RootId)
    }),
    [ServiceMethod.GalleryLayout]: async ({ query }) => gallery.layout(query),
    [ServiceMethod.GalleryImages]: async ({ ids }) => gallery.images(ids),
    [ServiceMethod.DirectoryTree]: async ({ rootId }) =>
      gallery.directoryTree(rootId as RootId) ?? null,
    [ServiceMethod.ImageGeneration]: async ({ imageId }) =>
      generationDetails.details(imageId as ImageId),
    [ServiceMethod.ImageGenerationText]: async ({ imageId, variant }) => {
      const details = generationDetails.details(imageId as ImageId)
      return details ? generationText(details, variant) : null
    },
    [ServiceMethod.RenderDisplayCopy]: ({ imageId, maxWidth }) =>
      displayCopies.render(imageId as ImageId, maxWidth),
    [ServiceMethod.RescanRoot]: async ({ rootId }) => ({
      started: await roots.rescan(rootId as RootId)
    })
  }
}
