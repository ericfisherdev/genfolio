import { z } from 'zod'
import { GenerationFormat, GeneratorKind, ResourceKind } from './generation-kinds'
import { MetadataOrigin } from './metadata-kinds'

export { CopyVariant, GenerationFormat, GeneratorKind, ResourceKind } from './generation-kinds'

export const generationResourceSchema = z
  .object({
    kind: z.enum(ResourceKind),
    /** The stored model's id, to link to a filter; null if it isn't stored. */
    modelId: z.number().int().positive().nullable(),
    name: z.string(),
    hash: z.string().nullable(),
    /** LoRAs only; null when no source gave one. */
    weight: z.number().nullable(),
    /** The best source that gave the weight, for the unknown-weight tooltip. */
    weightSource: z.enum(MetadataOrigin).nullable()
  })
  .strict()

export type GenerationResource = z.infer<typeof generationResourceSchema>

export const metadataSourceSchema = z
  .object({
    origin: z.enum(MetadataOrigin),
    records: z.array(z.object({ key: z.string(), value: z.string() }).strict()).readonly()
  })
  .strict()

export type MetadataSource = z.infer<typeof metadataSourceSchema>

/** Everything the detail page shows about how an image was generated. Untrusted text. */
export const generationDetailsSchema = z
  .object({
    generator: z.enum(GeneratorKind),
    /** The source whose prompt was used. */
    origin: z.enum(MetadataOrigin),
    prompt: z.string().nullable(),
    negativePrompt: z.string().nullable(),
    seed: z.string().nullable(),
    steps: z.number().nullable(),
    cfgScale: z.number().nullable(),
    sampler: z.string().nullable(),
    scheduler: z.string().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    vae: z.string().nullable(),
    styles: z.array(z.string()).readonly().nullable(),
    performance: z.string().nullable(),
    /** Checkpoint first, then refiner, then LoRAs in their order. */
    resources: z.array(generationResourceSchema).readonly(),
    /** The format `params` was parsed from: A1111 keys, or Fooocus's snake_case fields. */
    paramsFormat: z.enum(GenerationFormat),
    params: z.record(z.string(), z.string()),
    /** Raw records grouped by where they were found, in storage order. */
    sources: z.array(metadataSourceSchema).readonly()
  })
  .strict()

export type GenerationDetails = z.infer<typeof generationDetailsSchema>
