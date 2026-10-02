import { createHash } from 'node:crypto'
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rmdir,
  unlink,
  type FileHandle
} from 'node:fs/promises'
import { join } from 'node:path'
import { DownloadError, type DownloadFiles, type PartialFile } from '@domain/downloads'

const PART_SUFFIX = '.part'

const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException).code

// Hard links aren't there on every file system (FAT, exFAT, some network shares); a rename is the
// fallback, checked for an existing file first.
const NO_LINKS = new Set(['EPERM', 'ENOTSUP', 'ENOSYS', 'EXDEV', 'EOPNOTSUPP'])

/** Writes downloads to a `.part` file beside the target and links it into place when done. */
export class NodeDownloadFiles implements DownloadFiles {
  async resolveFolder(root: string, name: string): Promise<string> {
    try {
      const entries = await readdir(root, { withFileTypes: true })
      const same = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === name)
      if (same) return join(root, same.name)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
    }
    return join(root, name)
  }

  async exists(path: string): Promise<boolean> {
    try {
      await lstat(path)
      return true
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return false
      throw error
    }
  }

  async ensureFolder(path: string): Promise<void> {
    await mkdir(path, { recursive: true })
  }

  async removeEmptyFolder(path: string): Promise<void> {
    try {
      await rmdir(path)
    } catch (error) {
      const code = errorCode(error)
      if (code !== 'ENOTEMPTY' && code !== 'EEXIST' && code !== 'ENOENT') throw error
    }
  }

  async begin(path: string): Promise<PartialFile> {
    const partPath = `${path}${PART_SUFFIX}`
    // A leftover from an earlier attempt that never finished is started over.
    const handle = await open(partPath, 'w')
    return new NodePartialFile(handle, partPath, path)
  }
}

class NodePartialFile implements PartialFile {
  private readonly hash = createHash('sha256')
  private bytes = 0
  private closed = false

  constructor(
    private readonly handle: FileHandle,
    private readonly partPath: string,
    private readonly target: string
  ) {}

  async write(chunk: Uint8Array): Promise<void> {
    this.hash.update(chunk)
    // A write may take fewer bytes than offered; finish the chunk.
    let offset = 0
    while (offset < chunk.length) {
      const { bytesWritten } = await this.handle.write(chunk, offset)
      offset += bytesWritten
    }
    this.bytes += chunk.length
  }

  async finish(): Promise<{ bytes: number; sha256: string }> {
    await this.handle.sync()
    await this.close()
    return { bytes: this.bytes, sha256: this.hash.digest('hex') }
  }

  async publish(): Promise<void> {
    try {
      await link(this.partPath, this.target)
    } catch (error) {
      const code = errorCode(error)
      if (code === 'EEXIST') throw exists()
      if (code === undefined || !NO_LINKS.has(code)) throw error
      if (await new NodeDownloadFiles().exists(this.target)) throw exists()
      await rename(this.partPath, this.target)
      return
    }
    await unlink(this.partPath)
  }

  async discard(): Promise<void> {
    await this.close()
    try {
      await unlink(this.partPath)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
    }
  }

  private async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.handle.close()
  }
}

const exists = (): DownloadError =>
  new DownloadError('A file with this name appeared in the folder, so it was not replaced.')
