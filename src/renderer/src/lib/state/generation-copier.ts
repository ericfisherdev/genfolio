import type { GenfolioApi } from '@shared/genfolio-api'
import { CopyVariant } from '@shared/generation-kinds'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

const TEXT_NAMES: Readonly<Record<CopyVariant, string>> = {
  [CopyVariant.Prompt]: 'prompt',
  [CopyVariant.PromptWithLoras]: 'prompt with LoRA tags',
  [CopyVariant.Negative]: 'negative prompt',
  [CopyVariant.All]: 'generation data',
  [CopyVariant.Fooocus]: 'Fooocus parameters'
}

/** Copies generation text through main and reports the outcome in the notice bar. Never rejects. */
export class GenerationCopier {
  constructor(
    private readonly api: Pick<GenfolioApi, 'copyGeneration'>,
    private readonly notices: NoticeSink
  ) {}

  async copy(imageId: number, variant: CopyVariant): Promise<void> {
    const name = TEXT_NAMES[variant]
    try {
      const copied = await this.api.copyGeneration(imageId, variant)
      this.notices.notify(copied ? `Copied the ${name}.` : `This image has no ${name} to copy.`)
    } catch (error) {
      this.notices.notify(`Could not copy the ${name}: ${userMessage(error)}`)
    }
  }
}
