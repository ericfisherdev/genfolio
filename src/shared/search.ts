import { z } from 'zod'
import { GeneratorKind } from './generation-kinds'
import { KeywordScope, SetMatchMode } from './search-kinds'

export { KeywordScope, SetMatchMode } from './search-kinds'

const id = z.number().int().positive()
const ids = z.array(id).min(1).max(200)

/**
 * What narrows a gallery view. Every field is optional and they all must hold (AND); within
 * a list, `checkpointIds` and `generators` match any value, `loras` follows its `mode`.
 */
export const searchFiltersSchema = z
  .object({
    /** Checkpoint or refiner. */
    checkpointIds: ids.optional(),
    loras: z
      .object({
        ids,
        mode: z.enum(SetMatchMode),
        /** A bound excludes LoRAs whose weight is unknown; no bound keeps them. */
        minWeight: z.number().finite().optional(),
        maxWeight: z.number().finite().optional()
      })
      .strict()
      .refine(
        ({ minWeight, maxWeight }) =>
          minWeight === undefined || maxWeight === undefined || minWeight <= maxWeight,
        { message: 'minWeight must not exceed maxWeight' }
      )
      .optional(),
    keywords: z
      .object({ query: z.string().max(1000), scope: z.enum(KeywordScope) })
      .strict()
      .optional(),
    generators: z.array(z.enum(GeneratorKind)).min(1).max(10).optional(),
    seed: z.string().min(1).max(40).optional(),
    /** Images whose prompt equals this image's prompt. */
    samePromptAs: id.optional(),
    hasMetadata: z.boolean().optional()
  })
  .strict()

export type SearchFilters = z.infer<typeof searchFiltersSchema>
