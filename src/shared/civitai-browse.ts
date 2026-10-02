import { z } from 'zod'
import { ModelKind } from './generation-kinds'

const id = z.number().int().positive()

/** Models per page of results. */
export const BROWSE_PAGE_SIZE = 20

export const civitaiBrowseQuerySchema = z
  .object({
    kind: z.enum(ModelKind),
    text: z.string().trim().max(200).optional(),
    /** Civitai's own base model name, e.g. `SDXL 1.0`. */
    baseModel: z.string().trim().max(100).optional(),
    /** Opaque: the previous page's `nextCursor`. */
    cursor: z.string().max(500).optional()
  })
  .strict()

export type CivitaiBrowseQuery = z.infer<typeof civitaiBrowseQuerySchema>

/** One version of a model found on Civitai. */
export const civitaiBrowseVersionSchema = z
  .object({
    versionId: id,
    name: z.string(),
    baseModel: z.string().nullable(),
    publishedAt: z.string().nullable(),
    trainedWords: z.array(z.string()).readonly(),
    /** The file that would be downloaded; null when the version has no model file to download. */
    fileName: z.string().nullable(),
    sizeKb: z.number().nonnegative().nullable()
  })
  .strict()

export type CivitaiBrowseVersion = z.infer<typeof civitaiBrowseVersionSchema>

export const civitaiBrowseItemSchema = z
  .object({
    modelId: id,
    name: z.string(),
    creator: z.string().nullable(),
    nsfw: z.boolean(),
    downloads: z.number().int().nonnegative().nullable(),
    thumbsUp: z.number().int().nonnegative().nullable(),
    tags: z.array(z.string()).readonly(),
    /** As Civitai lists them, newest first. */
    versions: z.array(civitaiBrowseVersionSchema).readonly()
  })
  .strict()

export type CivitaiBrowseItem = z.infer<typeof civitaiBrowseItemSchema>

export const civitaiBrowsePageSchema = z
  .object({
    items: z.array(civitaiBrowseItemSchema).readonly(),
    /** Pass as `cursor` for the next page; null at the end. */
    nextCursor: z.string().nullable()
  })
  .strict()

export type CivitaiBrowsePage = z.infer<typeof civitaiBrowsePageSchema>

export const downloadPlanParamsSchema = z.object({ modelId: id, versionId: id }).strict()

/** What a download needs to know: which file, where from, and what it should hash to. */
export const downloadPlanSchema = z
  .object({
    /** Already safe to use as a file name. */
    fileName: z.string().min(1),
    sizeKb: z.number().nonnegative().nullable(),
    /** Lower-case hex; null when Civitai gives none. */
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    downloadUrl: z.url(),
    baseModel: z.string().nullable(),
    modelName: z.string(),
    versionName: z.string()
  })
  .strict()

export type DownloadPlan = z.infer<typeof downloadPlanSchema>
