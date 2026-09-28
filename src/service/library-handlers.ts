import { Transformer } from '@napi-rs/image'
import type Database from 'better-sqlite3'
import { fileRef } from '@application/file-ref'
import { LibraryRoots } from '@application/library-roots'
import { ScanCoordinator } from '@application/scan-coordinator'
import { ScanRoot } from '@application/scan-root'
import type { RootId } from '@domain/library'
import type { ScanLogger } from '@domain/scan'
import { SqliteDirectoryRepository } from '@infrastructure/db/repositories/sqlite-directory-repository'
import { SqliteImageRepository } from '@infrastructure/db/repositories/sqlite-image-repository'
import { SqliteLibraryRootRepository } from '@infrastructure/db/repositories/sqlite-library-root-repository'
import { NodeDirectoryResolver } from '@infrastructure/fs/node-directory-resolver'
import { NodeFileWalker } from '@infrastructure/fs/node-file-walker'
import { ImageSizeHeaderReader } from '@infrastructure/imaging/image-size-header-reader'
import type { ScanEvent } from '@shared/scan'
import { ServiceMethod } from '@shared/service-contract'
import { HealthReporter } from './health/health-reporter'
import { ImageCodecProbe } from './health/image-codec-probe'
import { RuntimeProbe } from './health/runtime-probe'
import { SqliteProbe } from './health/sqlite-probe'
import type { ServiceHandlers } from './rpc-dispatcher'

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
  const scanner = new ScanRoot({
    walker: new NodeFileWalker(scanLogger, fileRef),
    headerReader: new ImageSizeHeaderReader(),
    directories,
    images,
    logger: scanLogger,
    fileRef,
    now
  })
  const roots = new LibraryRoots({
    roots: new SqliteLibraryRootRepository(db),
    directories,
    images,
    scans: new ScanCoordinator(scanner, emit),
    resolver: new NodeDirectoryResolver(),
    transact: (work) => db.transaction(work)(),
    now
  })
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
    [ServiceMethod.RescanRoot]: async ({ rootId }) => ({
      started: await roots.rescan(rootId as RootId)
    })
  }
}
