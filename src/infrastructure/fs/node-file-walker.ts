import type { Dirent } from 'node:fs'
import { opendir, stat } from 'node:fs/promises'
import { extname, join, parse } from 'node:path'
import type { FileWalker, FoundFile, ScanLogger, ScanScope } from '@domain/scan'

export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.gif'
])

const isMissing = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** Stems of the `.txt` files in a listing (A1111 writes `<image stem>.txt`). */
function textFileStems(entries: readonly Dirent[]): Set<string> {
  return new Set(
    entries
      .filter((entry) => extname(entry.name).toLowerCase() === '.txt')
      .map((entry) => parse(entry.name).name)
  )
}

/** Files of one folder stat'ed at once; a folder of thousands is not one round trip each. */
const STAT_CONCURRENCY = 32

/**
 * Iterative depth-first walk. Skips hidden entries and every symlink (no loops, nothing
 * outside the root). An unreadable root rejects; an unreadable subdirectory or file is
 * logged and skipped.
 */
export class NodeFileWalker implements FileWalker {
  constructor(
    private readonly logger: ScanLogger,
    private readonly fileRef: (path: string) => string
  ) {}

  async *walk(
    rootPath: string,
    signal: AbortSignal,
    onSkippedDir: (relDir: string) => void = () => undefined,
    scope?: ScanScope
  ): AsyncIterable<FoundFile> {
    const pending = scope ? [...scope] : ['']
    while (pending.length > 0) {
      signal.throwIfAborted()
      const relDir = pending.pop() as string
      const entries = await this.entriesOf(rootPath, relDir, onSkippedDir)
      const textStems = textFileStems(entries)
      const imageNames: string[] = []
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          if (!scope) pending.push(relDir === '' ? entry.name : `${relDir}/${entry.name}`)
        } else if (entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          imageNames.push(entry.name)
        }
      }
      yield* this.describeAll(rootPath, relDir, imageNames, textStems, signal)
    }
  }

  /** Stats the folder's images with bounded concurrency and yields them in listing order. */
  private async *describeAll(
    rootPath: string,
    relDir: string,
    fileNames: readonly string[],
    textStems: ReadonlySet<string>,
    signal: AbortSignal
  ): AsyncIterable<FoundFile> {
    for (let start = 0; start < fileNames.length; start += STAT_CONCURRENCY) {
      signal.throwIfAborted()
      const chunk = fileNames.slice(start, start + STAT_CONCURRENCY)
      const found = await Promise.all(
        chunk.map((name) => this.describe(rootPath, relDir, name, textStems.has(parse(name).name)))
      )
      for (const file of found) if (file) yield file
    }
  }

  private async entriesOf(
    rootPath: string,
    relDir: string,
    onSkippedDir: (relDir: string) => void
  ): Promise<Dirent[]> {
    const path = join(rootPath, relDir)
    const entries: Dirent[] = []
    try {
      for await (const entry of await opendir(path)) entries.push(entry)
    } catch (error) {
      if (relDir === '') throw error
      // A folder deleted since it was listed (or named in a scope) holds nothing now.
      if (isMissing(error)) return []
      this.logger.warn('Skipping unreadable directory', this.fileRef(path))
      onSkippedDir(relDir)
    }
    return entries
  }

  private async describe(
    rootPath: string,
    relDir: string,
    fileName: string,
    hasTextSidecar: boolean
  ): Promise<FoundFile | undefined> {
    const path = join(rootPath, relDir, fileName)
    try {
      const stats = await stat(path)
      return {
        relDir,
        fileName,
        sizeBytes: stats.size,
        mtimeMs: Math.trunc(stats.mtimeMs),
        hasTextSidecar
      }
    } catch {
      this.logger.warn('Skipping unreadable file', this.fileRef(path))
      return undefined
    }
  }
}
