import type { GenfolioApi } from '@shared/genfolio-api'
import type { ModelKind } from '@shared/generation-kinds'
import type { ModelFolders } from '@shared/model-folders'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type ModelFoldersApi = Pick<
  GenfolioApi,
  'getModelFolders' | 'chooseModelFolder' | 'clearModelFolder'
>

/**
 * The folders downloaded models go to. Choosing opens main's folder picker, so the renderer
 * never handles a path it made up. Reports failures in the notice bar; never rejects.
 */
export class ModelFoldersState {
  folders: ModelFolders = $state({ checkpoint: null, lora: null })
  loaded = $state(false)

  constructor(
    private readonly api: ModelFoldersApi,
    private readonly notices: NoticeSink
  ) {}

  async load(): Promise<void> {
    await this.attempt('load the model folders', () => this.api.getModelFolders())
    this.loaded = true
  }

  choose(kind: ModelKind): Promise<void> {
    return this.attempt('set the folder', () => this.api.chooseModelFolder(kind))
  }

  clear(kind: ModelKind): Promise<void> {
    return this.attempt('clear the folder', () => this.api.clearModelFolder(kind))
  }

  private async attempt(description: string, work: () => Promise<ModelFolders>): Promise<void> {
    try {
      this.folders = await work()
    } catch (error) {
      this.notices.notify(`Could not ${description}: ${userMessage(error)}`)
    }
  }
}
