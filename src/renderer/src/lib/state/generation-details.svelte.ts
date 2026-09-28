import type { GenfolioApi } from '@shared/genfolio-api'
import type { GenerationDetails } from '@shared/generation'
import { userMessage } from '../format/user-message'

/**
 * The generation data of the image on screen. `details` is undefined while loading and null
 * when the image carries none. Never rejects: failures become `loadError`, and a load that
 * finishes after a newer one is ignored.
 */
export class GenerationDetailsState {
  details: GenerationDetails | null | undefined = $state(undefined)
  loadError: string | undefined = $state(undefined)
  private imageId = 0
  private generation = 0

  constructor(private readonly api: Pick<GenfolioApi, 'getGeneration'>) {}

  async load(imageId: number): Promise<void> {
    const generation = ++this.generation
    this.imageId = imageId
    this.details = undefined
    this.loadError = undefined
    try {
      const details = await this.api.getGeneration(imageId)
      if (generation === this.generation) this.details = details
    } catch (error) {
      if (generation === this.generation) this.loadError = userMessage(error)
    }
  }

  /** Loads the current image again (after an error). */
  retry(): Promise<void> {
    return this.load(this.imageId)
  }
}
