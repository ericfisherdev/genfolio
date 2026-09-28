import { constants } from 'node:fs'
import { open, stat, type FileHandle } from 'node:fs/promises'
import type { LogFileSource } from '@domain/fooocus-log'
import type { FileStamp } from '@domain/repositories'

/** A day of Fooocus logging is a few MB; anything far larger isn't worth parsing. */
export const MAX_LOG_BYTES = 64 * 1024 * 1024

/**
 * `log.html` files on disk. Reads through one handle opened with O_NONBLOCK (a FIFO can't
 * block), only from a regular file, and never more than MAX_LOG_BYTES + 1 bytes.
 */
export class NodeLogFileSource implements LogFileSource {
  async stat(path: string): Promise<FileStamp | undefined> {
    try {
      const stats = await stat(path)
      return stats.isFile()
        ? { sizeBytes: stats.size, mtimeMs: Math.trunc(stats.mtimeMs) }
        : undefined
    } catch {
      return undefined
    }
  }

  async read(path: string): Promise<string | undefined> {
    let handle: FileHandle | undefined
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
      const stats = await handle.stat()
      if (!stats.isFile() || stats.size > MAX_LOG_BYTES) return undefined
      const buffer = Buffer.alloc(stats.size + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > MAX_LOG_BYTES) return undefined
      return buffer.toString('utf8', 0, bytesRead)
    } catch {
      return undefined
    } finally {
      await handle?.close()
    }
  }
}
