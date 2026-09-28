import type { GeneratorKind } from '@shared/generation-kinds'
import type { MetadataOrigin } from '@shared/metadata-kinds'

/** A checkpoint (or refiner) as a generation names it. */
export interface ModelRef {
  readonly name: string
  readonly hash: string | null
}

/** One LoRA a generation applied; weight and hash are `null` when the source doesn't say. */
export interface LoraUse {
  readonly name: string
  readonly weight: number | null
  readonly hash: string | null
}

/**
 * What one metadata source says about a generation. Every field but `generator` and `params`
 * may be missing; merging sources field by field happens later.
 */
export interface ParsedGeneration {
  readonly generator: GeneratorKind
  readonly prompt?: string
  readonly negativePrompt?: string
  readonly seed?: string
  readonly steps?: number
  readonly cfgScale?: number
  readonly sampler?: string
  readonly scheduler?: string
  readonly width?: number
  readonly height?: number
  readonly checkpoint?: ModelRef
  readonly refiner?: ModelRef
  readonly vae?: string
  readonly loras?: readonly LoraUse[]
  readonly styles?: readonly string[]
  readonly performance?: string
  /** Every key/value the source carried, as text, for the details panel. */
  readonly params: Readonly<Record<string, string>>
}

/** A parsed generation and the record it came from. */
export interface SourcedGeneration {
  readonly origin: MetadataOrigin
  readonly generation: ParsedGeneration
}

/** Reads one text format of generation data. */
export interface GenerationParser {
  /** The generation in `text`, or `undefined` when the text isn't in this format. Never throws. */
  parse(text: string): ParsedGeneration | undefined
}
