import type { Dirent } from 'node:fs'
import { opendir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { FileWalker, FoundFile, ScanLogger } from '@domain/scan'

export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.gif'
])

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
    onSkippedDir: (relDir: string) => void = () => undefined
  ): AsyncIterable<FoundFile> {
    const pending = ['']
    while (pending.length > 0) {
      signal.throwIfAborted()
      const relDir = pending.pop() as string
      for (const entry of await this.entriesOf(rootPath, relDir, onSkippedDir)) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
        const relPath = relDir === '' ? entry.name : `${relDir}/${entry.name}`
        if (entry.isDirectory()) {
          pending.push(relPath)
        } else if (entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          const found = await this.describe(rootPath, relDir, entry.name)
          if (found) yield found
        }
      }
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
      this.logger.warn('Skipping unreadable directory', this.fileRef(path))
      onSkippedDir(relDir)
    }
    return entries
  }

  private async describe(
    rootPath: string,
    relDir: string,
    fileName: string
  ): Promise<FoundFile | undefined> {
    const path = join(rootPath, relDir, fileName)
    try {
      const stats = await stat(path)
      return { relDir, fileName, sizeBytes: stats.size, mtimeMs: Math.trunc(stats.mtimeMs) }
    } catch {
      this.logger.warn('Skipping unreadable file', this.fileRef(path))
      return undefined
    }
  }
}
