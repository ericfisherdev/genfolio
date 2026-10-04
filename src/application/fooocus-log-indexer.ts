import { join } from 'node:path'
import {
  FOOOCUS_LOG_FILE_NAME,
  type FooocusLogEntry,
  type FooocusLogFormat,
  LogEntryKind,
  type LogFileSource
} from '@domain/fooocus-log'
import type { Directory, DirectoryId, LibraryRoot } from '@domain/library'
import { MAX_RECORD_BYTES, type MetadataRecord } from '@domain/metadata-record'
import type {
  DirectoryRepository,
  FileStamp,
  FooocusLogRepository,
  ImageRepository
} from '@domain/repositories'
import type { TransactionRunner } from '@domain/transactions'
import { MetadataOrigin } from '@shared/metadata-kinds'
import type { ImageMetadataIndex } from './image-metadata-index'

export interface FooocusLogIndexerDependencies {
  readonly directories: DirectoryRepository
  readonly images: ImageRepository
  readonly logs: FooocusLogRepository
  readonly files: LogFileSource
  readonly format: FooocusLogFormat
  readonly metadata: ImageMetadataIndex
  readonly transactions: TransactionRunner
}

/** FwdFooocus keeps named image lists under `lists/`; their logs aren't imported. */
const isUnderLists = (relDir: string): boolean => relDir.split('/').includes('lists')

/** Parsed logs kept: live generation keeps writing to one day's log, so a few cover it. */
const MAX_CACHED_LOGS = 4

/** A log's parsed entries as of the file stamp they were read at. */
interface ParsedLog {
  readonly stamp: FileStamp
  readonly entries: ReadonlyMap<string, FooocusLogEntry>
}

const sameStamp = (a: FileStamp | undefined, b: FileStamp | undefined): boolean =>
  a?.sizeBytes === b?.sizeBytes && a?.mtimeMs === b?.mtimeMs

/** The entry as a raw record, or `undefined` for upscale-only or oversized entries. */
function logRecord(entry: FooocusLogEntry | undefined): MetadataRecord | undefined {
  if (!entry || entry.kind !== LogEntryKind.Generation) return undefined
  const value = JSON.stringify(entry.fields)
  if (Buffer.byteLength(value) > MAX_RECORD_BYTES) return undefined
  return { origin: MetadataOrigin.FooocusLog, key: FOOOCUS_LOG_FILE_NAME, value }
}

/**
 * Applies each directory's Fooocus `log.html` to the images beside it: the image's entry is
 * stored as a FooocusLog record next to its embedded records, and its generation is merged
 * again. A log is read when its size or mtime differs from the stored stamp. Re-indexing an
 * image drops its log record, so the scan forgets its directory's stamp in that same
 * transaction ({@link forget}); the log is then re-read even after an interrupted scan.
 * Images whose entry is unchanged aren't rewritten. A log read at some stamp stays parsed in
 * memory (a few at most), so forgetting a stamp for re-indexed images doesn't make an
 * unchanged log be read and parsed again. Rejects with the signal's reason when aborted, or
 * with any database error.
 */
export class FooocusLogIndexer {
  /** Least recently parsed first. */
  private readonly parsed = new Map<DirectoryId, ParsedLog>()

  constructor(private readonly deps: FooocusLogIndexerDependencies) {}

  /**
   * Forgets the directory's log stamp so the next refresh re-reads its log. Call it in the
   * transaction that re-indexed images there, since that dropped their log records: the
   * stamp then can't claim the log is applied, even if the scan stops before refreshing.
   */
  forget(directoryId: DirectoryId): void {
    this.deps.logs.remove(directoryId)
  }

  /** `relDirs`: the directories holding images. */
  async refresh(
    root: LibraryRoot,
    relDirs: ReadonlySet<string>,
    signal: AbortSignal
  ): Promise<void> {
    for (const directory of this.deps.directories.listByRelPaths(root.id, [...relDirs])) {
      if (isUnderLists(directory.relPath)) continue
      signal.throwIfAborted()
      await this.refreshDirectory(root, directory)
    }
  }

  private async refreshDirectory(root: LibraryRoot, directory: Directory): Promise<void> {
    const path = join(root.path, directory.relPath, FOOOCUS_LOG_FILE_NAME)
    const stamp = await this.deps.files.stat(path)
    const stored = this.deps.logs.find(directory.id)
    if (sameStamp(stamp, stored)) return
    const entries = await this.entriesAt(path, directory.id, stamp)
    if (!entries) return
    this.deps.transactions.run(() => {
      this.apply(directory.id, entries)
      if (stamp) this.deps.logs.save(directory.id, stamp)
      else this.deps.logs.remove(directory.id)
    })
  }

  /**
   * The log's entries at `stamp`: none when there is no log, the parsed ones kept from an
   * earlier read at the same stamp, else freshly parsed. `undefined` when the log can't be read.
   */
  private async entriesAt(
    path: string,
    directoryId: DirectoryId,
    stamp: FileStamp | undefined
  ): Promise<ReadonlyMap<string, FooocusLogEntry> | undefined> {
    if (!stamp) {
      this.parsed.delete(directoryId)
      return new Map()
    }
    const kept = this.parsed.get(directoryId)
    if (kept && sameStamp(kept.stamp, stamp)) return kept.entries
    const html = await this.deps.files.read(path)
    if (html === undefined) return undefined
    const entries = this.deps.format.parse(html)
    this.keep(directoryId, { stamp, entries })
    return entries
  }

  private keep(directoryId: DirectoryId, log: ParsedLog): void {
    this.parsed.delete(directoryId)
    this.parsed.set(directoryId, log)
    for (const oldest of this.parsed.keys()) {
      if (this.parsed.size <= MAX_CACHED_LOGS) break
      this.parsed.delete(oldest)
    }
  }

  private apply(directoryId: DirectoryId, entries: ReadonlyMap<string, FooocusLogEntry>): void {
    const storedLogs = this.deps.metadata.storedValuesInDirectory(
      directoryId,
      MetadataOrigin.FooocusLog,
      FOOOCUS_LOG_FILE_NAME
    )
    for (const [fileName, version] of this.deps.images.versionsInDirectory(directoryId)) {
      const next = logRecord(entries.get(fileName))
      if (storedLogs.get(fileName) === next?.value) continue
      const embedded = this.deps.metadata
        .storedRecords(version)
        .filter((record) => record.origin !== MetadataOrigin.FooocusLog)
      this.deps.metadata.index(version, next ? [...embedded, next] : embedded)
    }
  }
}
