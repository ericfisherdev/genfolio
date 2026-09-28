import { join } from 'node:path'
import type { ImageLocator } from '@domain/image-location'
import type { ImageId } from '@domain/library'
import { isInside } from './path-containment'

export interface ResolvedImageFile {
  /** Absolute, symlink-free path inside the image's library root. */
  readonly path: string
  readonly width: number
  readonly height: number
  readonly mtimeMs: number
}

export type RealPath = (path: string) => Promise<string>

/**
 * Turns an image id into a file path that is safe to read: the stored location is resolved
 * with `realpath` and must still lie inside its root's real path, so a file swapped for a
 * symlink pointing elsewhere is refused. Missing ids and files resolve to `undefined`.
 */
export class ImageFileResolver {
  constructor(
    private readonly locator: ImageLocator,
    private readonly realpath: RealPath
  ) {}

  async resolve(id: ImageId): Promise<ResolvedImageFile | undefined> {
    const location = this.locator.locate(id)
    if (!location) return undefined
    try {
      const root = await this.realpath(location.rootPath)
      const path = await this.realpath(join(location.rootPath, location.relDir, location.fileName))
      if (!isInside(path, root)) return undefined
      return { path, width: location.width, height: location.height, mtimeMs: location.mtimeMs }
    } catch {
      return undefined
    }
  }
}
