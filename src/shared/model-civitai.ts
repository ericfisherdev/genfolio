import { z } from 'zod'

const id = z.number().int().positive()

/** What Civitai says about a model version, as stored; the fetched values, never the user's own. */
export const civitaiInfoSchema = z
  .object({
    modelId: id,
    versionId: id,
    modelName: z.string(),
    versionName: z.string(),
    baseModel: z.string().nullable(),
    triggerWords: z.array(z.string()).readonly(),
    /** The model page's description, as plain text. */
    description: z.string().nullable(),
    /** The version's own notes, as plain text. */
    versionDescription: z.string().nullable(),
    creator: z.string().nullable(),
    nsfw: z.boolean(),
    tags: z.array(z.string()).readonly(),
    downloads: z.number().int().nonnegative().nullable(),
    thumbsUp: z.number().int().nonnegative().nullable(),
    publishedAt: z.string().nullable(),
    /** When it was fetched, in ms since the epoch. */
    fetchedAt: z.number().int().nonnegative()
  })
  .strict()

export type CivitaiInfo = z.infer<typeof civitaiInfoSchema>

/** What is stored when linking: everything fetched, before it is stamped with a time. */
export type CivitaiRecord = Omit<CivitaiInfo, 'fetchedAt'>
