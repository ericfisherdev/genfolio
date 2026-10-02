import { z } from 'zod'
import type { CivitaiFile, CivitaiModel, CivitaiVersion } from '@domain/civitai'
import { htmlToText } from './html-to-text'

// Only what Genfolio reads. Civitai adds fields freely, so unknown ones are ignored, and most
// of the ones read may be absent or null.

const text = z.string().nullish()
const count = z.number().int().nonnegative().nullish()

const fileSchema = z.object({
  name: z.string(),
  sizeKB: z.number().nonnegative().nullish(),
  type: text,
  primary: z.boolean().nullish(),
  downloadUrl: text,
  hashes: z.record(z.string(), z.string()).nullish()
})

const versionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  baseModel: text,
  trainedWords: z.array(z.string()).nullish(),
  description: text,
  publishedAt: text,
  files: z.array(fileSchema).nullish()
})

export const modelSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  type: z.string(),
  description: text,
  nsfw: z.boolean().nullish(),
  tags: z.array(z.string()).nullish(),
  creator: z.object({ username: text }).nullish(),
  stats: z.object({ downloadCount: count, thumbsUpCount: count }).nullish(),
  modelVersions: z.array(versionSchema).nullish()
})

/** A model version looked up by file hash. */
export const versionByHashSchema = z.object({
  id: z.number().int().positive(),
  modelId: z.number().int().positive()
})

export const searchSchema = z.object({
  items: z.array(z.unknown()),
  metadata: z.object({ nextCursor: z.string().nullish() }).nullish()
})

type FileResponse = z.infer<typeof fileSchema>
type VersionResponse = z.infer<typeof versionSchema>
export type ModelResponse = z.infer<typeof modelSchema>

const fileOf = (file: FileResponse): CivitaiFile => ({
  name: file.name,
  sizeKb: file.sizeKB ?? null,
  type: file.type ?? null,
  primary: file.primary ?? false,
  downloadUrl: file.downloadUrl ?? null,
  hashes: file.hashes ?? {}
})

const versionOf = (version: VersionResponse): CivitaiVersion => ({
  id: version.id,
  name: version.name,
  baseModel: version.baseModel ?? null,
  trainedWords: (version.trainedWords ?? []).map((word) => word.trim()).filter(Boolean),
  description: htmlToText(version.description),
  publishedAt: version.publishedAt ?? null,
  files: (version.files ?? []).map(fileOf)
})

export const modelOf = (model: ModelResponse): CivitaiModel => ({
  id: model.id,
  name: model.name,
  type: model.type,
  description: htmlToText(model.description),
  creator: model.creator?.username ?? null,
  nsfw: model.nsfw ?? false,
  tags: model.tags ?? [],
  downloads: model.stats?.downloadCount ?? null,
  thumbsUp: model.stats?.thumbsUpCount ?? null,
  versions: (model.modelVersions ?? []).map(versionOf)
})
