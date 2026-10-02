import { z } from 'zod'
import { ChangeOutcome } from './change-outcome'
import { ModelKind } from './generation-kinds'
import { civitaiInfoSchema } from './model-civitai'
import { userNameSchema } from './user-name'

export { ChangeOutcome } from './change-outcome'

export const MAX_MODEL_NAME = 256
export const MAX_BASE_MODEL = 100
export const MAX_TRIGGER_WORDS = 100
export const MAX_TRIGGER_WORD = 200
export const MAX_MODEL_TEXT = 20_000
export const MAX_MODELS_PER_PAGE = 200
export const MAX_MODEL_SEARCH = 200
/** Largest LoRA strength (either sign) a model can be given. */
export const MAX_STRENGTH = 20

/** A model by its stable key: its kind and `models.identity` (case-folded name, no folders or extension). */
export const modelKeySchema = z
  .object({ kind: z.enum(ModelKind), identity: z.string().min(1).max(MAX_MODEL_NAME) })
  .strict()

export type ModelKey = z.infer<typeof modelKeySchema>

/** What the user records about a model; each field may be empty. */
export const modelFieldsSchema = z
  .object({
    baseModel: z.string().max(MAX_BASE_MODEL).nullable(),
    triggerWords: z.array(z.string().min(1).max(MAX_TRIGGER_WORD)).max(MAX_TRIGGER_WORDS),
    /** The weight the model works well at, e.g. 0.8 for a LoRA. */
    strength: z.number().finite().min(-MAX_STRENGTH).max(MAX_STRENGTH).nullable(),
    description: z.string().max(MAX_MODEL_TEXT).nullable(),
    notes: z.string().max(MAX_MODEL_TEXT).nullable()
  })
  .strict()

export type ModelFields = z.infer<typeof modelFieldsSchema>

/**
 * A model in the list: one the library's images use, or one the user added by hand. What it
 * shows combines the user's own entry with what Civitai says: the user's base model and
 * strength win, and the trigger words are both lists, the user's first.
 */
export const modelEntrySchema = z
  .object({
    kind: z.enum(ModelKind),
    identity: z.string(),
    name: z.string(),
    /** Images that use it (a checkpoint as model or refiner). */
    imageCount: z.number().int().nonnegative(),
    /** Whether anything is recorded about it, by the user or fetched from Civitai. */
    hasInfo: z.boolean(),
    baseModel: z.string().nullable(),
    triggerWords: z.array(z.string()).readonly(),
    strength: z.number().nullable()
  })
  .strict()

export type ModelEntry = z.infer<typeof modelEntrySchema>

/** A model with what is behind its entry: the user's own fields, and the Civitai link. */
export const modelDetailSchema = modelEntrySchema
  .extend({ custom: modelFieldsSchema, civitai: civitaiInfoSchema.nullable() })
  .strict()

export type ModelDetail = z.infer<typeof modelDetailSchema>

/** Every field narrows the list (AND); `text` matches the name, base model, trigger words, description and notes. */
export const modelListQuerySchema = z
  .object({
    text: z.string().max(MAX_MODEL_SEARCH).optional(),
    kind: z.enum(ModelKind).optional(),
    baseModel: z.string().max(MAX_BASE_MODEL).optional(),
    /** Only models with nothing recorded and no Civitai link (false isn't a filter). */
    withoutInfo: z.literal(true).optional(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(MAX_MODELS_PER_PAGE)
  })
  .strict()

export type ModelListQuery = z.infer<typeof modelListQuerySchema>

export const modelListSchema = z
  .object({
    /** Models matching, across all pages. */
    total: z.number().int().nonnegative(),
    items: z.array(modelEntrySchema).readonly(),
    /** Every base model recorded, to pick a filter from. */
    baseModels: z.array(z.string()).readonly()
  })
  .strict()

export type ModelList = z.infer<typeof modelListSchema>

/** A model name as typed: trimmed, 1–256 characters, no control characters. */
export const modelNameSchema = userNameSchema(MAX_MODEL_NAME)

/** The result of saving or adding a model's info. */
export const modelChangeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal(ChangeOutcome.Done), model: modelDetailSchema }).strict(),
  z.object({ outcome: z.literal(ChangeOutcome.Duplicate), existing: modelDetailSchema }).strict(),
  z.object({ outcome: z.literal(ChangeOutcome.Missing) }).strict()
])

export type ModelChange = z.infer<typeof modelChangeSchema>

/** A model's info with nothing recorded. */
export const EMPTY_MODEL_FIELDS: ModelFields = {
  baseModel: null,
  triggerWords: [],
  strength: null,
  description: null,
  notes: null
}
