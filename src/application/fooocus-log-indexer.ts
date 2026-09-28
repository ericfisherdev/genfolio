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

const sameStamp = (a: FileStamp | undefined, b: FileStamp | undefined): boolean =>
  a?.sizeBytes === b?.sizeBytes && a?.mtimeMs === b?.mtimeMs

/** The entry as a raw record, or `undefined` for upscale-only or oversized entries. */
function logRecord(entry: FooocusLogEntry | undefined): MetadataRecord | undefined {
  if (!entry || entry.kind !== LogEntryKind.Generation) return undefined
  const value = JSON.stringify(entry.fields)
  if (value.length > MAX_RECORD_BYTES) return undefined
  return { origin: MetadataOrigin.FooocusLog, key: FOOOCUS_LOG_FILE_NAME, value }
}

/**
 * Applies each directory's Fooocus `log.html` to the images beside it: the image's entry is
 * stored as a FooocusLog record next to its embedded records, and its generation is merged
 * again. A log is read when its size or mtime changed since the last read, or when images in
 * its directory were (re)indexed, since that drops their log records. Images whose entry is
 * unchanged aren't rewritten. Rejects with the signal's reason when aborted, or with any
 * database error.
 */
export class FooocusLogIndexer {
  constructor(private readonly deps: FooocusLogIndexerDependencies) {}

  /** `relDirs`: directories holding images; `touchedDirs`: those whose images were just indexed. */
  async refresh(
    root: LibraryRoot,
    relDirs: ReadonlySet<string>,
    touchedDirs: ReadonlySet<string>,
    signal: AbortSignal
  ): Promise<void> {
    for (const directory of this.deps.directories.listByRoot(root.id)) {
      if (!relDirs.has(directory.relPath) || isUnderLists(directory.relPath)) continue
      signal.throwIfAborted()
      await this.refreshDirectory(root, directory, touchedDirs.has(directory.relPath))
    }
  }

  private async refreshDirectory(
    root: LibraryRoot,
    directory: Directory,
    touched: boolean
  ): Promise<void> {
    const path = join(root.path, directory.relPath, FOOOCUS_LOG_FILE_NAME)
    const stamp = await this.deps.files.stat(path)
    const stored = this.deps.logs.find(directory.id)
    if (sameStamp(stamp, stored) && (!touched || stamp === undefined)) return
    const html = stamp ? await this.deps.files.read(path) : undefined
    if (stamp && html === undefined) return
    const entries = html === undefined ? new Map() : this.deps.format.parse(html)
    this.deps.transactions.run(() => {
      this.apply(directory.id, entries)
      if (stamp) this.deps.logs.save(directory.id, stamp)
      else this.deps.logs.remove(directory.id)
    })
  }

  private apply(directoryId: DirectoryId, entries: ReadonlyMap<string, FooocusLogEntry>): void {
    for (const [fileName, version] of this.deps.images.versionsInDirectory(directoryId)) {
      const stored = this.deps.metadata.storedRecords(version)
      const embedded = stored.filter((record) => record.origin !== MetadataOrigin.FooocusLog)
      const previous = stored.find((record) => record.origin === MetadataOrigin.FooocusLog)
      const next = logRecord(entries.get(fileName))
      if (previous?.value === next?.value) continue
      this.deps.metadata.index(version, next ? [...embedded, next] : embedded)
    }
  }
}
