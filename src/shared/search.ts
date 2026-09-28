import { z } from 'zod'
import { MAX_RATING } from './gallery-kinds'
import { GeneratorKind } from './generation-kinds'
import { KeywordScope, MAX_SEED_LENGTH, SetMatchMode } from './search-kinds'

export { KeywordScope, MAX_SEED_LENGTH, SetMatchMode } from './search-kinds'

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
    seed: z.string().min(1).max(MAX_SEED_LENGTH).optional(),
    /** Images whose prompt equals this image's prompt. */
    samePromptAs: id.optional(),
    hasMetadata: z.boolean().optional(),
    /** Tags an image must carry (all or any of `ids`), and tags it must not carry. */
    tags: z
      .object({ ids: ids.optional(), mode: z.enum(SetMatchMode), excludeIds: ids.optional() })
      .strict()
      .refine(({ ids, excludeIds }) => ids !== undefined || excludeIds !== undefined, {
        message: 'a tag filter needs tags to include or exclude'
      })
      .optional(),
    /** Only images marked as favourites (false isn't a filter). */
    favoritesOnly: z.literal(true).optional(),
    /** At least this many stars. */
    minRating: z.number().int().min(1).max(MAX_RATING).optional()
  })
  .strict()

export type SearchFilters = z.infer<typeof searchFiltersSchema>

const facetValue = z
  .object({ id, name: z.string(), count: z.number().int().nonnegative() })
  .strict()

/**
 * What the filter pickers offer, with image counts within the query's scope and its other
 * filters: a facet ignores its own selection so more values stay selectable.
 */
export const searchFacetsSchema = z
  .object({
    /** Checkpoints, counted as model or refiner. */
    checkpoints: z.array(facetValue).readonly(),
    loras: z.array(facetValue).readonly(),
    tags: z.array(facetValue).readonly(),
    generators: z
      .array(
        z.object({ kind: z.enum(GeneratorKind), count: z.number().int().nonnegative() }).strict()
      )
      .readonly(),
    withoutMetadata: z.number().int().nonnegative()
  })
  .strict()

export type SearchFacets = z.infer<typeof searchFacetsSchema>
export type FacetValue = z.infer<typeof facetValue>

/** A model named by its stable key: `models.identity` (case-folded name, no folders or extension). */
const storedModel = z.object({ identity: z.string().min(1).max(256) }).strict()
const storedModels = z.array(storedModel).min(1).max(200)

/** Longest prompt a smart album can store for "same prompt". */
export const MAX_STORED_PROMPT = 16_384

/**
 * SearchFilters as a smart album stores them (albums.filters_json). Row ids are recycled
 * after models are pruned or images deleted, so models are named by identity and "same
 * prompt" by the prompt's text; both are resolved to ids when the album is opened, and an
 * identity that no longer exists matches nothing.
 */
export const storedSearchFiltersSchema = z
  .object({
    checkpoints: storedModels.optional(),
    loras: z
      .object({
        models: storedModels,
        mode: z.enum(SetMatchMode),
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
    seed: z.string().min(1).max(MAX_SEED_LENGTH).optional(),
    samePrompt: z.string().min(1).max(MAX_STORED_PROMPT).optional(),
    hasMetadata: z.boolean().optional()
  })
  .strict()

export type StoredSearchFilters = z.infer<typeof storedSearchFiltersSchema>
