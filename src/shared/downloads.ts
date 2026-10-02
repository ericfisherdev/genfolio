import { z } from 'zod'
import { DownloadStatus } from './downloads-kinds'
import { ModelKind } from './generation-kinds'

export { DownloadStatus, isFinished } from './downloads-kinds'

const id = z.number().int().positive()

/** What to download: a version of a Civitai model, as a checkpoint or a LoRA. */
export const downloadRequestSchema = z
  .object({ kind: z.enum(ModelKind), modelId: id, versionId: id })
  .strict()

export type DownloadRequest = z.infer<typeof downloadRequestSchema>

/** How one download stands; main sends a new one whenever it changes (progress at most 4 a second). */
export const downloadSnapshotSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(ModelKind),
    modelId: id,
    versionId: id,
    status: z.enum(DownloadStatus),
    modelName: z.string().nullable(),
    versionName: z.string().nullable(),
    fileName: z.string().nullable(),
    /** The base model subfolder it goes into, once known. */
    folder: z.string().nullable(),
    /** Where the file is, once it is there (or already was). */
    path: z.string().nullable(),
    receivedBytes: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative().nullable(),
    /** Why it failed or was left alone, for the user. */
    message: z.string().nullable()
  })
  .strict()

export type DownloadSnapshot = z.infer<typeof downloadSnapshotSchema>
