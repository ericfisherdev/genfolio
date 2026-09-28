import { Transformer } from '@napi-rs/image'
import type Database from 'better-sqlite3'
import { lstat, open, realpath, stat } from 'node:fs/promises'
import { ByteLruCache } from '@application/byte-lru-cache'
import { ConcurrencyLimiter } from '@application/concurrency-limiter'
import { DisplayCopies } from '@application/display-copies'
import { fileRef } from '@application/file-ref'
import { ImageFileResolver } from '@application/image-file-resolver'
import { ImageForgetter } from '@application/image-forgetter'
import { HashIndexer } from '@application/hash-indexer'
import { HashingQueue } from '@application/hashing-queue'
import { LiveUpdates } from '@application/live-updates'
import { SimilarityService } from '@application/similarity-service'
import { LibraryRoots } from '@application/library-roots'
import { GenerationDetailsReader } from '@application/generation-details-reader'
import { ScanCoordinator } from '@application/scan-coordinator'
import { AlbumService } from '@application/album-service'
import { TagService } from '@application/tag-service'
import { generationText } from '@domain/generation-text'
import type { ImageId, RootId } from '@domain/library'
import type { ScanLogger } from '@domain/scan'
import { SqliteDirectoryRepository } from '@infrastructure/db/repositories/sqlite-directory-repository'
import { SqliteGenerationRepository } from '@infrastructure/db/repositories/sqlite-generation-repository'
import { SqliteImageVersionCheck } from '@infrastructure/db/repositories/sqlite-image-version-check'
import { SqliteMetadataRecordRepository } from '@infrastructure/db/repositories/sqlite-metadata-record-repository'
import { SqliteModelCatalog } from '@infrastructure/db/repositories/sqlite-model-catalog'
import { SqliteImageMarkRepository } from '@infrastructure/db/repositories/sqlite-image-mark-repository'
import { SqliteImageRepository } from '@infrastructure/db/repositories/sqlite-image-repository'
import { SqliteAlbumRepository } from '@infrastructure/db/repositories/sqlite-album-repository'
import { SqliteImageHashRepository } from '@infrastructure/db/repositories/sqlite-image-hash-repository'
import { SqliteSimilarityRepository } from '@infrastructure/db/repositories/sqlite-similarity-repository'
import { NapiImageHasher } from '@infrastructure/imaging/napi-image-hasher'
import {
  describeError,
  LogLevel,
  type RotatingFileLog
} from '@infrastructure/logging/rotating-file-log'
import { ChokidarFileWatcher } from '@infrastructure/fs/chokidar-file-watcher'
import { SqliteSlideshowPresetRepository } from '@infrastructure/db/repositories/sqlite-slideshow-preset-repository'
import { SqliteTagRepository } from '@infrastructure/db/repositories/sqlite-tag-repository'
import { SqliteLibraryRootRepository } from '@infrastructure/db/repositories/sqlite-library-root-repository'
import { createImageSelector } from '@infrastructure/db/search/create-image-selector'
import { SqliteSmartAlbumEvaluator } from '@infrastructure/db/search/sqlite-smart-album-evaluator'
import { SqliteStoredFilterCodec } from '@infrastructure/db/search/stored-filter-codec'
import { SqliteFacetReader } from '@infrastructure/db/search/sqlite-facet-reader'
import { SqliteGalleryReader } from '@infrastructure/db/sqlite-gallery-reader'
import { SqliteImageLocator } from '@infrastructure/db/sqlite-image-locator'
import { NapiImageResizer } from '@infrastructure/imaging/napi-image-resizer'
import { NodeDirectoryResolver } from '@infrastructure/fs/node-directory-resolver'
import { ScanEventType, type ScanEvent } from '@shared/scan'
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
/** Hashing shares that pool in the background, so it leaves room for grid copies. */
const HASH_CONCURRENCY = 2

/** Builds every service handler over an open, migrated library database. */
export function createLibraryHandlers(
  db: Database.Database,
  emit: (event: ScanEvent) => void,
  log: Pick<RotatingFileLog, 'write'>
): ServiceHandlers {
  const scanLogger: ScanLogger = {
    warn: (message, ref) => {
      console.warn(`[library-service] ${message} (file ${ref})`)
      log.write(LogLevel.Warn, `${message} (file ${ref})`)
    }
  }
  const now = (): number => Date.now()
  const directories = new SqliteDirectoryRepository(db)
  const images = new SqliteImageRepository(db)
  const imageFiles = new ImageFileResolver(new SqliteImageLocator(db), {
    open: (path) => open(path, 'r'),
    realpath,
    stat
  })
  const similarity = new SimilarityService(
    new SqliteSimilarityRepository(db),
    () => new Promise((resolve) => setImmediate(resolve))
  )
  const logFailure =
    (what: string) =>
    (error: unknown): void => {
      console.error(`[library-service] ${what} failed`, error)
      log.write(LogLevel.Error, `${what} failed: ${describeError(error)}`)
    }
  const hashing = new HashingQueue(
    new HashIndexer(
      new SqliteImageHashRepository(db),
      imageFiles,
      new NapiImageHasher(),
      { run: (work) => db.transaction(work)() },
      { batchSize: 200, concurrency: HASH_CONCURRENCY }
    ),
    emit,
    (ids) => void similarity.index(ids).catch(logFailure('finding look-alikes')),
    logFailure('hashing')
  )
  // Every finished scan may have added or changed images to hash.
  const emitAndHash = (event: ScanEvent): void => {
    emit(event)
    if (event.type !== ScanEventType.Finished) return
    // Removed images leave their groups; new and changed ones are hashed, then compared.
    similarity.regroup()
    void similarity.ensureCurrent().catch(logFailure('finding look-alikes'))
    hashing.request()
  }
  const scanner = createScanRoot(db, { directories, images, logger: scanLogger, fileRef, now })
  const roots = new LibraryRoots({
    roots: new SqliteLibraryRootRepository(db),
    directories,
    images,
    scans: new ScanCoordinator(scanner, emitAndHash),
    resolver: new NodeDirectoryResolver(),
    transact: (work) => db.transaction(work)(),
    now
  })
  const marks = new SqliteImageMarkRepository(db)
  const presets = new SqliteSlideshowPresetRepository(db)
  const tags = new TagService(new SqliteTagRepository(db), now)
  const selector = createImageSelector(db)
  const gallery = new SqliteGalleryReader(db, selector)
  const facets = new SqliteFacetReader(db, selector)
  const albums = new AlbumService(
    new SqliteAlbumRepository(db),
    new SqliteStoredFilterCodec(db),
    new SqliteSmartAlbumEvaluator(db, selector),
    now
  )
  const versions = new SqliteImageVersionCheck(db)
  const models = new SqliteModelCatalog(db)
  const generations = new SqliteGenerationRepository(db, models, versions)
  const forgetter = new ImageForgetter(
    new SqliteImageLocator(db),
    { exists: pathExists },
    images,
    generations
  )
  const generationDetails = new GenerationDetailsReader(
    generations,
    new SqliteMetadataRecordRepository(db, versions),
    createGenerationParser(),
    models
  )
  const displayCopies = new DisplayCopies(
    imageFiles,
    new NapiImageResizer(),
    new ByteLruCache<string>(DISPLAY_COPY_CACHE_BYTES),
    new ConcurrencyLimiter(DISPLAY_COPY_CONCURRENCY)
  )
  const health = new HealthReporter([
    new RuntimeProbe(process.versions),
    new SqliteProbe(db),
    new ImageCodecProbe(Transformer)
  ])

  // Images left unhashed by an earlier session (or by an older HASH_VERSION).
  void similarity.ensureCurrent().catch(logFailure('finding look-alikes'))
  hashing.request()
  // Changes made while the app was closed: every root is scanned (unchanged files are cheap).
  void roots.reconcileAll().catch(logFailure('reconciling the library'))
  const live = new LiveUpdates(
    new ChokidarFileWatcher(),
    {
      refresh: (rootId, dirs) => roots.refresh(rootId, dirs),
      rescan: (rootId) => void roots.rescan(rootId).catch(logFailure('rescanning a root')),
      watchUnavailable: (rootId) => emit({ type: ScanEventType.WatchUnavailable, rootId })
    },
    {
      setTimeout: (callback, ms) => setTimeout(callback, ms),
      clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
      setInterval: (callback, ms) => setInterval(callback, ms),
      clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout)
    }
  )
  void live.sync(roots.all()).catch(logFailure('watching the library'))

  return {
    [ServiceMethod.Health]: () => health.report(),
    [ServiceMethod.ListRoots]: async () => roots.list(),
    [ServiceMethod.AddRoot]: async ({ path }) => {
      const result = await roots.add(path)
      await live.sync(roots.all())
      return result
    },
    [ServiceMethod.RemoveRoot]: async ({ rootId }) => {
      const removed = await roots.remove(rootId as RootId)
      await live.sync(roots.all())
      return { removed }
    },
    [ServiceMethod.GalleryLayout]: async ({ query }) => gallery.layout(query),
    [ServiceMethod.GalleryImages]: async ({ ids }) => gallery.images(ids),
    [ServiceMethod.TagsList]: async () => tags.list(),
    [ServiceMethod.TagsOfImage]: async ({ imageId }) => tags.tagsOf(imageId as ImageId),
    [ServiceMethod.TagsCreate]: async ({ name }) => tags.create(name),
    [ServiceMethod.TagsRename]: async ({ id, name }) => tags.rename(id, name),
    [ServiceMethod.TagsMerge]: async ({ fromId, intoId }) => tags.merge(fromId, intoId),
    [ServiceMethod.TagsDelete]: async ({ id }) => ({ deleted: tags.delete(id) }),
    [ServiceMethod.TagsApply]: async ({ tagIds, imageIds }) => ({
      changed: tags.apply(tagIds, imageIds as ImageId[])
    }),
    [ServiceMethod.TagsRemove]: async ({ tagIds, imageIds }) => ({
      changed: tags.remove(tagIds, imageIds as ImageId[])
    }),
    [ServiceMethod.AlbumsList]: async () => albums.list(),
    [ServiceMethod.AlbumsCreate]: async ({ name }) => albums.create(name),
    [ServiceMethod.AlbumsCreateSmart]: async ({ name, filters }) =>
      albums.createSmart(name, filters),
    [ServiceMethod.AlbumsRename]: async ({ id, name }) => albums.rename(id, name),
    [ServiceMethod.AlbumsDelete]: async ({ id }) => ({ deleted: albums.delete(id) }),
    [ServiceMethod.AlbumsSetCover]: async ({ id, imageId }) =>
      albums.setCover(id, imageId as ImageId | null),
    [ServiceMethod.AlbumsAdd]: async ({ albumId, imageIds }) => ({
      changed: albums.add(albumId, imageIds as ImageId[])
    }),
    [ServiceMethod.AlbumsRemove]: async ({ albumId, imageIds }) => ({
      changed: albums.remove(albumId, imageIds as ImageId[])
    }),
    [ServiceMethod.AlbumsMove]: async ({ albumId, imageIds, beforeId }) => ({
      changed: albums.move(albumId, imageIds as ImageId[], beforeId as ImageId | null)
    }),
    [ServiceMethod.ImagesForget]: async ({ ids }) => {
      const forgotten = await forgetter.forget(ids as ImageId[])
      if (forgotten > 0) similarity.regroup()
      return { forgotten }
    },
    [ServiceMethod.SimilarGroupMembers]: async ({ groupId }) => similarity.members(groupId),
    [ServiceMethod.SimilarGroups]: async ({ offset, limit }) => similarity.groups(offset, limit),
    [ServiceMethod.SimilarityThreshold]: async () => ({ threshold: similarity.threshold() }),
    [ServiceMethod.SetSimilarityThreshold]: async ({ threshold }) => {
      similarity.setThreshold(threshold)
      return { threshold }
    },
    [ServiceMethod.PresetsList]: async () => presets.list(),
    [ServiceMethod.PresetsSave]: async ({ name, settings }) => presets.save(name, settings),
    [ServiceMethod.PresetsDelete]: async ({ id }) => ({ deleted: presets.delete(id) }),
    [ServiceMethod.SetFavorite]: async ({ ids, favorite }) => ({
      changed: marks.setFavorite(ids as ImageId[], favorite)
    }),
    [ServiceMethod.SetRating]: async ({ ids, rating }) => ({
      changed: marks.setRating(ids as ImageId[], rating)
    }),
    [ServiceMethod.SearchFacets]: async ({ query }) => facets.facets(query),
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

/** Whether anything is at the path, without following a link; unsure (not ENOENT) is yes. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT'
  }
}
