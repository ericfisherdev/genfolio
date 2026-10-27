import { z } from 'zod'
import { ModelKind } from './generation-kinds'
import { MAX_STATS_ROWS } from './model-stats-kinds'
import { modelTagRefSchema } from './model-tags'
import { modelKeySchema } from './models'

export { DEFAULT_STATS_ROWS, MAX_STATS_ROWS } from './model-stats-kinds'

const id = z.number().int().positive()
const imageCount = z.number().int().positive()
/** Rows per list a request may ask for. */
export const statsRowLimitSchema = z.number().int().min(1).max(MAX_STATS_ROWS)

/**
 * A model in a stats row. `id` is `models.id`, which is recycled when unused models are
 * pruned: it names the model only until the next scan, so routes use `kind` and `identity`.
 */
export const modelStatRefSchema = z
  .object({ id, kind: z.enum(ModelKind), identity: z.string(), name: z.string() })
  .strict()

export type ModelStatRef = z.infer<typeof modelStatRefSchema>

/** A ranked model. A checkpoint's count is its images as model or refiner, each counted once. */
export const modelStatSchema = modelStatRefSchema
  .extend({ imageCount, tags: z.array(modelTagRefSchema).readonly() })
  .strict()

export type ModelStat = z.infer<typeof modelStatSchema>

/**
 * Two models used together, with the images that use both. Unordered, listed once: for a
 * checkpoint with a LoRA `first` is the checkpoint, for two LoRAs `first.id < second.id`.
 */
export const modelPairSchema = z
  .object({ first: modelStatRefSchema, second: modelStatRefSchema, imageCount })
  .strict()

export type ModelPair = z.infer<typeof modelPairSchema>

/** `modelTagId` keeps tagged models and the pairs with at least one tagged side. */
export const modelStatsQuerySchema = z
  .object({ modelTagId: id.optional(), limit: statsRowLimitSchema.optional() })
  .strict()

export type ModelStatsQuery = z.infer<typeof modelStatsQuerySchema>

/** Each list is ranked by image count, highest first, and holds at most the query's limit. */
export const modelStatsOverviewSchema = z
  .object({
    checkpoints: z.array(modelStatSchema).readonly(),
    loras: z.array(modelStatSchema).readonly(),
    checkpointLoraPairs: z.array(modelPairSchema).readonly(),
    loraPairs: z.array(modelPairSchema).readonly()
  })
  .strict()

export type ModelStatsOverview = z.infer<typeof modelStatsOverviewSchema>

export const modelUsageQuerySchema = z
  .object({ key: modelKeySchema, limit: statsRowLimitSchema.optional() })
  .strict()

export type ModelUsageQuery = z.infer<typeof modelUsageQuerySchema>

/**
 * How one model is used. Each list holds pairs that include the model, ranked by image
 * count: `loras` the LoRAs used with it (a LoRA's partners, or a checkpoint's LoRAs) and
 * `checkpoints` the checkpoints a LoRA is used with (empty for a checkpoint).
 */
export const modelUsageSchema = z
  .object({
    model: modelStatSchema,
    loras: z.array(modelPairSchema).readonly(),
    checkpoints: z.array(modelPairSchema).readonly()
  })
  .strict()

export type ModelUsage = z.infer<typeof modelUsageSchema>
