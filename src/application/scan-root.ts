import { join } from 'node:path'
import { parseFooocusTimestamp } from '@domain/fooocus-filename'
import type { ImageHeader, ImageHeaderReader } from '@domain/image-header'
import type { DirectoryId, ImageFile, LibraryRoot, RootId } from '@domain/library'
import {
  METADATA_INDEX_VERSION,
  type MetadataReader,
  type MetadataRecord
} from '@domain/metadata-record'
import type { DirectoryRepository, ImageRepository, StoredFileStat } from '@domain/repositories'
import {
  ScanPhase,
  type FileWalker,
  type FoundFile,
  type ScanLogger,
  type ScanProgress,
  type ScanReport,
  type ScanScope
} from '@domain/scan'
import type { TransactionRunner } from '@domain/transactions'
import { forEachConcurrent } from './for-each-concurrent'
import type { FooocusLogIndexer } from './fooocus-log-indexer'
import type { ImageMetadataIndex } from './image-metadata-index'
import { ProgressThrottle } from './progress-throttle'

export interface ScanRootDependencies {
  readonly walker: FileWalker
  readonly headerReader: ImageHeaderReader
  readonly directories: DirectoryRepository
  readonly images: ImageRepository
  readonly metadataReader: MetadataReader
  readonly metadata: ImageMetadataIndex
  readonly logs: FooocusLogIndexer
  readonly transactions: TransactionRunner
  readonly logger: ScanLogger
  readonly fileRef: (path: string) => string
  readonly now: () => number
}

export interface ScanRootOptions {
  readonly batchSize: number
  readonly headerConcurrency: number
  readonly progressIntervalMs: number
}

export const DEFAULT_SCAN_OPTIONS: ScanRootOptions = {
  batchSize: 500,
  headerConcurrency: 8,
  progressIntervalMs: 100
}

type ReportProgress = (
  phase: ScanPhase,
  done: number,
  total: number | undefined,
  final?: boolean
) => void

interface Classified {
  readonly toIndex: FoundFile[]
  readonly seen: Set<string>
  /** Every directory holding at least one image. */
  readonly dirs: Set<string>
  readonly unchanged: number
  /** Unreadable subdirectories: their stored rows are kept, not treated as deleted. */
  readonly skippedDirs: string[]
}

/** A scan of this root is already running; `run` must not overlap for one root. */
export class ScanAlreadyRunningError extends Error {
  constructor(readonly rootId: RootId) {
    super(`A scan of library root ${rootId} is already running`)
    this.name = 'ScanAlreadyRunningError'
  }
}

interface IndexCounts {
  added: number
  updated: number
  failed: number
}

/** A file's row plus the raw metadata records read from it. */
interface DescribedImage {
  readonly image: ImageFile
  readonly records: MetadataRecord[]
}

const fileKey = (relDir: string, fileName: string): string => `${relDir}\0${fileName}`

const isWithin = (relDir: string, dirs: readonly string[]): boolean =>
  dirs.some((dir) => relDir === dir || relDir.startsWith(`${dir}/`))

/** Unchanged on disk and indexed with the current metadata extraction. */
const isUnchanged = (previous: StoredFileStat | undefined, file: FoundFile): boolean =>
  previous !== undefined &&
  previous.sizeBytes === file.sizeBytes &&
  previous.mtimeMs === file.mtimeMs &&
  previous.metadataVersion === METADATA_INDEX_VERSION

/**
 * Brings one root's rows in line with the disk: indexes new and changed files with their
 * metadata, applies changed Fooocus logs, deletes rows for files that are gone, and prunes
 * emptied directories and unused models. Each batch (images and their metadata) is its own
 * transaction and deletions happen only after a complete walk, so an abort leaves a
 * consistent database.
 * Rows under unreadable subdirectories are kept. Rejects with the signal's reason when
 * aborted, with the walker's error when the root itself is unreadable, with any database
 * error, and with {@link ScanAlreadyRunningError} when this root is already being scanned.
 */
export class ScanRoot {
  private readonly inFlight = new Set<RootId>()

  constructor(
    private readonly deps: ScanRootDependencies,
    private readonly options: ScanRootOptions = DEFAULT_SCAN_OPTIONS
  ) {}

  /**
   * With `scope`, only the files directly in those folders are indexed and only their rows
   * can be removed; rows elsewhere in the root are left alone.
   */
  async run(
    root: LibraryRoot,
    signal: AbortSignal,
    onProgress: (progress: ScanProgress) => void = () => undefined,
    scope?: ScanScope
  ): Promise<ScanReport> {
    if (this.inFlight.has(root.id)) throw new ScanAlreadyRunningError(root.id)
    this.inFlight.add(root.id)
    try {
      return await this.scan(root, signal, onProgress, scope)
    } finally {
      this.inFlight.delete(root.id)
    }
  }

  private async scan(
    root: LibraryRoot,
    signal: AbortSignal,
    onProgress: (progress: ScanProgress) => void,
    scope: ScanScope | undefined
  ): Promise<ScanReport> {
    const throttle = new ProgressThrottle(
      onProgress,
      this.options.progressIntervalMs,
      this.deps.now
    )
    const report: ReportProgress = (phase, done, total, final = false) =>
      throttle.report({ rootId: root.id, phase, done, total }, final)

    const stored = new Map(
      this.storedStats(root, scope).map(
        (stat) => [fileKey(stat.relDir, stat.fileName), stat] as const
      )
    )
    const classified = await this.classify(root, stored, signal, report, scope)
    const counts = await this.index(root, classified.toIndex, stored, signal, report)
    await this.deps.logs.refresh(root, classified.dirs, signal)

    report(ScanPhase.Pruning, 0, undefined, true)
    const removed = this.removeMissing(stored, classified)
    this.deps.directories.pruneEmpty(root.id)
    this.deps.metadata.pruneUnusedModels()
    return { ...counts, unchanged: classified.unchanged, removed }
  }

  /** Only the scope's rows are read, so a one-file live refresh doesn't load the whole root. */
  private storedStats(root: LibraryRoot, scope: ScanScope | undefined): StoredFileStat[] {
    return scope
      ? this.deps.images.fileStatsByDirectories(root.id, scope)
      : this.deps.images.fileStatsByRoot(root.id)
  }

  private async classify(
    root: LibraryRoot,
    stored: ReadonlyMap<string, StoredFileStat>,
    signal: AbortSignal,
    report: ReportProgress,
    scope: ScanScope | undefined
  ): Promise<Classified> {
    const toIndex: FoundFile[] = []
    const seen = new Set<string>()
    const dirs = new Set<string>()
    const skippedDirs: string[] = []
    let unchanged = 0
    const walk = this.deps.walker.walk(
      root.path,
      signal,
      (relDir) => skippedDirs.push(relDir),
      scope
    )
    for await (const file of walk) {
      const key = fileKey(file.relDir, file.fileName)
      seen.add(key)
      dirs.add(file.relDir)
      if (isUnchanged(stored.get(key), file)) unchanged++
      else toIndex.push(file)
      report(ScanPhase.Walking, seen.size, undefined)
    }
    report(ScanPhase.Walking, seen.size, seen.size, true)
    return { toIndex, seen, dirs, unchanged, skippedDirs }
  }

  private async index(
    root: LibraryRoot,
    files: readonly FoundFile[],
    stored: ReadonlyMap<string, StoredFileStat>,
    signal: AbortSignal,
    report: ReportProgress
  ): Promise<IndexCounts> {
    const directoryOf = this.directoryResolver(root)
    const counts: IndexCounts = { added: 0, updated: 0, failed: 0 }
    let batch: DescribedImage[] = []
    const flush = (): void => {
      signal.throwIfAborted()
      if (batch.length > 0) this.store(batch)
      batch = []
    }
    let done = 0

    await forEachConcurrent(files, this.options.headerConcurrency, signal, async (file) => {
      const described = await this.describe(root, file, directoryOf)
      if (described) {
        batch.push(described)
        if (stored.has(fileKey(file.relDir, file.fileName))) counts.updated++
        else counts.added++
      } else {
        counts.failed++
      }
      if (batch.length >= this.options.batchSize) flush()
      report(ScanPhase.Indexing, ++done, files.length)
    })
    flush()
    report(ScanPhase.Indexing, done, files.length, true)
    return counts
  }

  /** Upserts the batch's rows and indexes their metadata in one transaction. */
  private store(batch: readonly DescribedImage[]): void {
    this.deps.transactions.run(() => {
      const versions = this.deps.images.upsertMany(
        batch.map((described) => described.image),
        this.deps.now()
      )
      versions.forEach((version, index) =>
        this.deps.metadata.index(version, batch[index]?.records ?? [])
      )
      // Re-indexing dropped these images' log records; forget the log stamps in the same
      // transaction so the log is re-applied even if the scan stops before refreshing.
      for (const directoryId of new Set(batch.map((described) => described.image.directoryId))) {
        this.deps.logs.forget(directoryId)
      }
    })
  }

  /**
   * Reads the header and metadata records; logs and returns `undefined` when the header
   * cannot be read or parsed (metadata reading never fails). Database errors (from
   * resolving the directory) propagate and fail the scan.
   */
  private async describe(
    root: LibraryRoot,
    file: FoundFile,
    directoryOf: (relDir: string) => DirectoryId
  ): Promise<DescribedImage | undefined> {
    const path = join(root.path, file.relDir, file.fileName)
    let header: ImageHeader
    try {
      header = await this.deps.headerReader.read(path)
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown error'
      this.deps.logger.warn(`Skipping image (${reason})`, this.deps.fileRef(path))
      return undefined
    }
    const records = await this.deps.metadataReader.read(path, header.format, {
      sidecar: file.hasTextSidecar
    })
    const image: ImageFile = {
      directoryId: directoryOf(file.relDir),
      fileName: file.fileName,
      format: header.format,
      sizeBytes: file.sizeBytes,
      mtimeMs: file.mtimeMs,
      width: header.width,
      height: header.height,
      createdAt: parseFooocusTimestamp(file.fileName) ?? file.mtimeMs
    }
    return { image, records }
  }

  private directoryResolver(root: LibraryRoot): (relDir: string) => DirectoryId {
    const ids = new Map<string, DirectoryId>()
    return (relDir) => {
      let id = ids.get(relDir)
      if (id === undefined) {
        id = this.deps.directories.ensure(root.id, relDir)
        ids.set(relDir, id)
      }
      return id
    }
  }

  private removeMissing(stored: ReadonlyMap<string, StoredFileStat>, walk: Classified): number {
    const missing: StoredFileStat[] = []
    for (const [key, stat] of stored) {
      if (!walk.seen.has(key) && !isWithin(stat.relDir, walk.skippedDirs)) missing.push(stat)
    }
    this.deps.images.deleteMany(missing)
    return missing.length
  }
}
