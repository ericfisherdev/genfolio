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
  /** From the open file too. */
  readonly sizeBytes: number
}

/** The filesystem calls the resolver needs; injectable so tests can race them. */
export interface ResolverFileSystem {
  open(path: string): Promise<FileHandle>
  realpath(path: string): Promise<string>
  stat(path: string): Promise<{ dev: number; ino: number }>
}

export enum FileStatus {
  /** Opened and verified. */
  Found = 'found',
  /** No file at the stored path any more. */
  Missing = 'missing',
  /** A file is there but was refused: outside the root, swapped, or not a regular file. */
  Refused = 'refused',
  /** A file is there but could not be opened (permissions, I/O). */
  Unreadable = 'unreadable',
  /** The id is not in the library. */
  Unknown = 'unknown'
}

export type FileInspection =
  | {
      readonly status: FileStatus.Found
      readonly file: OpenImageFile
      /**
       * Whether the stored path is itself the real path (no link below the root). Only then
       * does acting on the path act on this image's own file.
       */
      readonly exact: boolean
    }
  | {
      readonly status: Exclude<FileStatus, FileStatus.Found>
      /** The stored file name, when the id is known. */
      readonly fileName?: string
    }

const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR'])

/**
 * Turns an image id into an open, verified file. The file is opened first; then its real
 * path must lie inside the root's real path and name the same inode as the open handle.
 * A file swapped for a symlink at any point (before or after opening) is therefore refused,
 * and the caller reads exactly the inode that was checked.
 */
export class ImageFileResolver {
  constructor(
    private readonly locator: ImageLocator,
    private readonly fs: ResolverFileSystem
  ) {}

  /** The verified open file; unknown ids, missing files and refusals resolve to `undefined`. */
  async open(id: ImageId): Promise<OpenImageFile | undefined> {
    const inspection = await this.inspect(id)
    return inspection.status === FileStatus.Found ? inspection.file : undefined
  }

  /** Like `open`, but says why there is no file. A found file must be closed by the caller. */
  async inspect(id: ImageId): Promise<FileInspection> {
    const location = this.locator.locate(id)
    if (!location) return { status: FileStatus.Unknown }
    const { fileName } = location
    const candidate = join(location.rootPath, location.relDir, fileName)
    let handle: FileHandle
    try {
      handle = await this.fs.open(candidate)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const status = code && MISSING_CODES.has(code) ? FileStatus.Missing : FileStatus.Unreadable
      return { status, fileName }
    }
    try {
      const root = await this.fs.realpath(location.rootPath)
      const real = await this.fs.realpath(candidate)
      const [held, named] = await Promise.all([handle.stat(), this.fs.stat(real)])
      const sameFile = held.dev === named.dev && held.ino === named.ino
      if (!isInside(real, root) || !sameFile || !held.isFile()) {
        await handle.close()
        return { status: FileStatus.Refused, fileName }
      }
      return {
        status: FileStatus.Found,
        exact: real === join(root, location.relDir, fileName),
        file: {
          handle,
          path: real,
          fileName,
          width: location.width,
          height: location.height,
          mtimeMs: held.mtimeMs,
          sizeBytes: held.size
        }
      }
    } catch {
      await handle.close()
      return { status: FileStatus.Refused, fileName }
    }
  }
}
