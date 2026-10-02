import { z } from 'zod'
import { CivitaiOutcome } from './civitai-kinds'
import { ModelKind } from './generation-kinds'
import { modelDetailSchema, modelKeySchema } from './models'

export { CivitaiOutcome } from './civitai-kinds'

const id = z.number().int().positive()

export const MAX_CIVITAI_QUERY = 200
/** Most candidates one Civitai search returns. */
export const MAX_CIVITAI_CANDIDATES = 40

export const civitaiSearchParamsSchema = z
  .object({
    kind: z.enum(ModelKind),
    text: z.string().trim().min(1).max(MAX_CIVITAI_QUERY),
    /** The local model's identity, so a version whose file has that name is listed first. */
    identity: z.string().min(1).max(256).optional()
  })
  .strict()

export type CivitaiSearchParams = z.infer<typeof civitaiSearchParamsSchema>

/** One version of a Civitai model that could be linked. */
export const civitaiCandidateSchema = z
  .object({
    modelId: id,
    versionId: id,
    modelName: z.string(),
    versionName: z.string(),
    baseModel: z.string().nullable(),
    creator: z.string().nullable(),
    nsfw: z.boolean(),
    downloads: z.number().int().nonnegative().nullable(),
    thumbsUp: z.number().int().nonnegative().nullable(),
    fileNames: z.array(z.string()).readonly(),
    /** A file of this version has the local model's name. */
    matchesFileName: z.boolean()
  })
  .strict()

export type CivitaiCandidate = z.infer<typeof civitaiCandidateSchema>

export const civitaiLinkParamsSchema = z
  .object({ key: modelKeySchema, modelId: id, versionId: id })
  .strict()

/** The model with its new link, or why there is none. */
export const civitaiResultSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal(CivitaiOutcome.Linked), model: modelDetailSchema }).strict(),
  z.object({ outcome: z.literal(CivitaiOutcome.NotFound) }).strict(),
  z.object({ outcome: z.literal(CivitaiOutcome.Missing) }).strict(),
  z.object({ outcome: z.literal(CivitaiOutcome.Unlinked) }).strict()
])

export type CivitaiResult = z.infer<typeof civitaiResultSchema>
