import type { GenfolioApi } from '@shared/genfolio-api'
import type { GenerationDetails } from '@shared/generation'
import { userMessage } from '../format/user-message'

/**
 * The generation data of the image on screen. `details` is undefined until the first load
 * resolves and null when the image carries none; while a later load runs, the previous
 * details stay on screen so stepping between images doesn't flash "Loading". Never rejects:
 * failures become `loadError`, and a load that finishes after a newer one is ignored.
 */
export class GenerationDetailsState {
  details: GenerationDetails | null | undefined = $state(undefined)
  loadError: string | undefined = $state(undefined)
  /** The image `details` or `loadError` belong to; differs from the requested one while loading. */
  loadedImageId: number | undefined = $state(undefined)
  private imageId = 0
  private generation = 0

  constructor(private readonly api: Pick<GenfolioApi, 'getGeneration'>) {}

  async load(imageId: number): Promise<void> {
    const generation = ++this.generation
    this.imageId = imageId
    try {
      const details = await this.api.getGeneration(imageId)
      if (generation !== this.generation) return
      this.details = details
      this.loadError = undefined
      this.loadedImageId = imageId
    } catch (error) {
      if (generation !== this.generation) return
      this.loadError = userMessage(error)
      this.loadedImageId = imageId
    }
  }

  /** Loads the current image again (after an error). */
  retry(): Promise<void> {
    return this.load(this.imageId)
  }
}
