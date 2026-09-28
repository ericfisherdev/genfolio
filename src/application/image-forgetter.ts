import { join } from 'node:path'
import type { ImageLocator } from '@domain/image-location'
import type { ImageId } from '@domain/library'
import type { GenerationRepository, ImageRepository } from '@domain/repositories'

/** Whether anything is at a path (a file, a link, a folder), without following links. */
export interface PathProbe {
  exists(path: string): Promise<boolean>
}

/**
 * Removes images from the library after their files were deleted. Main asks, but only
 * images whose stored path is really empty now are forgotten, so a file that is still (or
 * again) there keeps its row. Models no generation uses any more are pruned after.
 */
export class ImageForgetter {
  constructor(
    private readonly locator: ImageLocator,
    private readonly probe: PathProbe,
    private readonly images: Pick<ImageRepository, 'deleteByIds'>,
    private readonly generations: Pick<GenerationRepository, 'pruneUnusedModels'>
  ) {}

  /** Returns how many images were forgotten. */
  async forget(ids: readonly ImageId[]): Promise<number> {
    const gone: ImageId[] = []
    for (const id of new Set(ids)) {
      const location = this.locator.locate(id)
      if (!location) continue
      const path = join(location.rootPath, location.relDir, location.fileName)
      if (!(await this.probe.exists(path))) gone.push(id)
    }
    if (gone.length === 0) return 0
    const forgotten = this.images.deleteByIds(gone)
    this.generations.pruneUnusedModels()
    return forgotten
  }
}
