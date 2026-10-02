import type { AppSettingsRepository } from '@domain/repositories'
import { ModelKind } from '@shared/generation-kinds'
import { folderPathSchema, type ModelFolders } from '@shared/model-folders'

const KEY_PREFIX = 'modelFolder.'
const keyOf = (kind: ModelKind): string => `${KEY_PREFIX}${kind}`

/** The folders downloaded checkpoints and LoRAs go to, kept in the app settings. */
export class ModelFolderSettings {
  constructor(private readonly settings: AppSettingsRepository) {}

  get(): ModelFolders {
    return {
      [ModelKind.Checkpoint]: this.read(ModelKind.Checkpoint),
      [ModelKind.Lora]: this.read(ModelKind.Lora)
    }
  }

  /** `null` clears the folder. */
  set(kind: ModelKind, path: string | null): ModelFolders {
    if (path === null) this.settings.remove(keyOf(kind))
    else this.settings.set(keyOf(kind), path)
    return this.get()
  }

  /** A stored value that is no longer a usable path counts as not chosen. */
  private read(kind: ModelKind): string | null {
    const parsed = folderPathSchema.safeParse(this.settings.get(keyOf(kind)))
    return parsed.success ? parsed.data : null
  }
}
