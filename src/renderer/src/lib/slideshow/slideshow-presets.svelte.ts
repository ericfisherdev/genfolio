import type { GenfolioApi } from '@shared/genfolio-api'
import type { SlideshowPreset, SlideshowSettings } from '@shared/slideshow'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from '../state/notice-sink'

type PresetsApi = Pick<
  GenfolioApi,
  'listSlideshowPresets' | 'saveSlideshowPreset' | 'deleteSlideshowPreset'
>

/** Named slideshow settings. Reports failures in the notice bar; never rejects. */
export class SlideshowPresetsState {
  presets: readonly SlideshowPreset[] = $state.raw([])

  constructor(
    private readonly api: PresetsApi,
    private readonly notices: NoticeSink
  ) {}

  async load(): Promise<void> {
    await this.attempt('load the slideshow presets', async () => {
      this.presets = await this.api.listSlideshowPresets()
    })
  }

  /** Saves under the name; a preset with the same name takes the new settings. */
  async save(name: string, settings: SlideshowSettings): Promise<void> {
    await this.attempt('save the preset', () => this.api.saveSlideshowPreset(name, settings))
    await this.load()
  }

  async delete(preset: SlideshowPreset): Promise<void> {
    await this.attempt('delete the preset', () => this.api.deleteSlideshowPreset(preset.id))
    await this.load()
  }

  private async attempt(description: string, command: () => Promise<unknown>): Promise<void> {
    try {
      await command()
    } catch (error) {
      this.notices.notify(`Could not ${description}: ${userMessage(error)}`)
    }
  }
}
