import { join } from 'node:path'
import { parseFooocusTimestamp } from '@domain/fooocus-filename'
import type { ImageHeader, ImageHeaderReader } from '@domain/image-header'
import type { DirectoryId, ImageFile, LibraryRoot, RootId } from '@domain/library'
import type { DirectoryRepository, ImageRepository, StoredFileStat } from '@domain/repositories'
import {
  ScanPhase,
  type FileWalker,
  type FoundFile,
  type ScanLogger,
  type ScanProgress,
  type ScanReport
} from '@domain/scan'
import { forEachConcurrent } from './for-each-concurrent'
import { ProgressThrottle } from './progress-throttle'

export interface ScanRootDependencies {
  readonly walker: FileWalker
  readonly headerReader: ImageHeaderReader
  readonly directories: DirectoryRepository
  readonly images: ImageRepository
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

const fileKey = (relDir: string, fileName: string): string => `${relDir}\0${fileName}`

const isWithin = (relDir: string, dirs: readonly string[]): boolean =>
  dirs.some((dir) => relDir === dir || relDir.startsWith(`${dir}/`))

const isUnchanged = (previous: StoredFileStat | undefined, file: FoundFile): boolean =>
  previous !== undefined &&
  previous.sizeBytes === file.sizeBytes &&
  previous.mtimeMs === file.mtimeMs

/**
 * Brings one root's rows in line with the disk: indexes new and changed files, deletes rows
 * for files that are gone, and prunes emptied directories. Each batch is its own transaction
 * and deletions happen only after a complete walk, so an abort leaves a consistent database.
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

  async run(
    root: LibraryRoot,
    signal: AbortSignal,
    onProgress: (progress: ScanProgress) => void = () => undefined
  ): Promise<ScanReport> {
    if (this.inFlight.has(root.id)) throw new ScanAlreadyRunningError(root.id)
    this.inFlight.add(root.id)
    try {
      return await this.scan(root, signal, onProgress)
    } finally {
      this.inFlight.delete(root.id)
    }
  }

  private async scan(
    root: LibraryRoot,
    signal: AbortSignal,
    onProgress: (progress: ScanProgress) => void
  ): Promise<ScanReport> {
    const throttle = new ProgressThrottle(
      onProgress,
      this.options.progressIntervalMs,
      this.deps.now
    )
    const report: ReportProgress = (phase, done, total, final = false) =>
      throttle.report({ rootId: root.id, phase, done, total }, final)

    const stored = new Map(
      this.deps.images
        .fileStatsByRoot(root.id)
        .map((stat) => [fileKey(stat.relDir, stat.fileName), stat] as const)
    )
    const classified = await this.classify(root, stored, signal, report)
    const counts = await this.index(root, classified.toIndex, stored, signal, report)

    report(ScanPhase.Pruning, 0, undefined, true)
    const removed = this.removeMissing(stored, classified)
    this.deps.directories.pruneEmpty(root.id)
    return { ...counts, unchanged: classified.unchanged, removed }
  }

  private async classify(
    root: LibraryRoot,
    stored: ReadonlyMap<string, StoredFileStat>,
    signal: AbortSignal,
    report: ReportProgress
  ): Promise<Classified> {
    const toIndex: FoundFile[] = []
    const seen = new Set<string>()
    const skippedDirs: string[] = []
    let unchanged = 0
    const walk = this.deps.walker.walk(root.path, signal, (relDir) => skippedDirs.push(relDir))
    for await (const file of walk) {
      const key = fileKey(file.relDir, file.fileName)
      seen.add(key)
      if (isUnchanged(stored.get(key), file)) unchanged++
      else toIndex.push(file)
      report(ScanPhase.Walking, seen.size, undefined)
    }
    report(ScanPhase.Walking, seen.size, seen.size, true)
    return { toIndex, seen, unchanged, skippedDirs }
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
    let batch: ImageFile[] = []
    const flush = (): void => {
      signal.throwIfAborted()
      if (batch.length > 0) this.deps.images.upsertMany(batch, this.deps.now())
      batch = []
    }
    let done = 0

    await forEachConcurrent(files, this.options.headerConcurrency, signal, async (file) => {
      const image = await this.describe(root, file, directoryOf)
      if (image) {
        batch.push(image)
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

  /**
   * Reads the header; logs and returns `undefined` when the file cannot be read or parsed.
   * Database errors (from resolving the directory) propagate and fail the scan.
   */
  private async describe(
    root: LibraryRoot,
    file: FoundFile,
    directoryOf: (relDir: string) => DirectoryId
  ): Promise<ImageFile | undefined> {
    const path = join(root.path, file.relDir, file.fileName)
    let header: ImageHeader
    try {
      header = await this.deps.headerReader.read(path)
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown error'
      this.deps.logger.warn(`Skipping image (${reason})`, this.deps.fileRef(path))
      return undefined
    }
    return {
      directoryId: directoryOf(file.relDir),
      fileName: file.fileName,
      format: header.format,
      sizeBytes: file.sizeBytes,
      mtimeMs: file.mtimeMs,
      width: header.width,
      height: header.height,
      createdAt: parseFooocusTimestamp(file.fileName) ?? file.mtimeMs
    }
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
