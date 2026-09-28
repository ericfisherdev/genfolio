import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import type { ImageLocator } from '@domain/image-location'
import type { ImageId } from '@domain/library'
import { isInside } from './path-containment'

/**
 * An open image file whose inode was verified to live inside its library root. Read only
 * through `handle` (never re-open by path) and close it when done.
 */
export interface OpenImageFile {
  readonly handle: FileHandle
  /** The verified real path; for revealing or copying only, never for reading. */
  readonly path: string
  readonly fileName: string
  readonly width: number
  readonly height: number
  /** Taken from the open file, not the database, so edits made since the scan count. */
  readonly mtimeMs: number
}

/** The filesystem calls the resolver needs; injectable so tests can race them. */
export interface ResolverFileSystem {
  open(path: string): Promise<FileHandle>
  realpath(path: string): Promise<string>
  stat(path: string): Promise<{ dev: number; ino: number }>
}

/**
 * Turns an image id into an open, verified file. The file is opened first; then its real
 * path must lie inside the root's real path and name the same inode as the open handle.
 * A file swapped for a symlink at any point (before or after opening) is therefore refused,
 * and the caller reads exactly the inode that was checked. Unknown ids, missing files and
 * refusals resolve to `undefined`.
 */
export class ImageFileResolver {
  constructor(
    private readonly locator: ImageLocator,
    private readonly fs: ResolverFileSystem
  ) {}

  async open(id: ImageId): Promise<OpenImageFile | undefined> {
    const location = this.locator.locate(id)
    if (!location) return undefined
    const candidate = join(location.rootPath, location.relDir, location.fileName)
    let handle: FileHandle
    try {
      handle = await this.fs.open(candidate)
    } catch {
      return undefined
    }
    try {
      const root = await this.fs.realpath(location.rootPath)
      const real = await this.fs.realpath(candidate)
      const [held, named] = await Promise.all([handle.stat(), this.fs.stat(real)])
      const sameFile = held.dev === named.dev && held.ino === named.ino
      if (!isInside(real, root) || !sameFile || !held.isFile()) {
        await handle.close()
        return undefined
      }
      return {
        handle,
        path: real,
        fileName: location.fileName,
        width: location.width,
        height: location.height,
        mtimeMs: held.mtimeMs
      }
    } catch {
      await handle.close()
      return undefined
    }
  }
}
