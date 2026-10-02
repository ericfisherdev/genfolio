import { z } from 'zod'
import { ModelKind } from './generation-kinds'

/** Longest folder path a setting can hold (Linux PATH_MAX). */
export const MAX_FOLDER_PATH = 4096

export const folderPathSchema = z.string().min(1).max(MAX_FOLDER_PATH)

/**
 * Where downloaded checkpoints and LoRAs go: one folder per kind, or null when not chosen
 * yet. Each download lands in a subfolder named for its base model.
 */
export const modelFoldersSchema = z
  .object({
    [ModelKind.Checkpoint]: folderPathSchema.nullable(),
    [ModelKind.Lora]: folderPathSchema.nullable()
  })
  .strict()

export type ModelFolders = z.infer<typeof modelFoldersSchema>
