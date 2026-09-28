import { GenerationFormat, GeneratorKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'
import type { ModelRef, ParsedGeneration, SourcedGeneration, StoredGeneration } from './generation'
import { LoraCollector } from './lora-collector'
import { modelDisplayName, modelIdentity } from './model-name'

/** Fields taken whole from the best source that has them. */
const SCALAR_FIELDS = [
  'prompt',
  'negativePrompt',
  'seed',
  'steps',
  'cfgScale',
  'sampler',
  'scheduler',
  'width',
  'height',
  'vae',
  'styles',
  'performance'
] as const satisfies readonly (keyof ParsedGeneration)[]

/**
 * Lower is better: Fooocus's embedded JSON is exact; its log keeps UTF-8 and LoRA weights that
 * its EXIF text may mangle or drop; embedded A1111 text beats a sidecar written beside it.
 */
function precedence(source: SourcedGeneration): number {
  if (source.origin === MetadataOrigin.FooocusLog) return 1
  if (source.origin === MetadataOrigin.SidecarTxt) return 3
  return source.format === GenerationFormat.FooocusJson ? 0 : 2
}

/**
 * Combines what every source says about one image, field by field: each field comes from the
 * best source that has it (see {@link precedence}), LoRAs are merged by name with weight and
 * hash filled from the best source that knows them, and `origin` names the source of the
 * prompt (or the best source when none has one). `null` when there are no sources.
 */
export class GenerationMerger {
  merge(sources: readonly SourcedGeneration[]): StoredGeneration | null {
    const ranked = [...sources].sort((a, b) => precedence(a) - precedence(b))
    const best = ranked[0]
    if (!best) return null
    const generations = ranked.map((source) => source.generation)
    const promptSource = ranked.find((source) => source.generation.prompt !== undefined) ?? best
    const merged: Record<string, unknown> = {
      generator: firstKnownGenerator(generations),
      origin: promptSource.origin,
      params: best.generation.params
    }
    for (const field of SCALAR_FIELDS) {
      const value = generations.find((generation) => generation[field] !== undefined)?.[field]
      if (value !== undefined) merged[field] = value
    }
    assignModel(
      merged,
      'checkpoint',
      generations.map((generation) => generation.checkpoint)
    )
    assignModel(
      merged,
      'refiner',
      generations.map((generation) => generation.refiner)
    )
    const loras = mergedLoras(generations)
    if (loras) merged['loras'] = loras
    return merged as unknown as StoredGeneration
  }
}

function firstKnownGenerator(generations: readonly ParsedGeneration[]): GeneratorKind {
  return (
    generations.find((generation) => generation.generator !== GeneratorKind.Unknown)?.generator ??
    GeneratorKind.Unknown
  )
}

/** The best source's model, with its hash filled from another source naming the same model. */
function assignModel(
  merged: Record<string, unknown>,
  field: 'checkpoint' | 'refiner',
  candidates: readonly (ModelRef | undefined)[]
): void {
  const models = candidates.filter((model): model is ModelRef => model !== undefined)
  const chosen = models[0]
  if (!chosen) return
  const identity = modelIdentity(chosen.name)
  const hash =
    chosen.hash ??
    models.find((model) => model.hash !== null && modelIdentity(model.name) === identity)?.hash ??
    null
  merged[field] = { name: modelDisplayName(chosen.name), hash }
}

function mergedLoras(
  generations: readonly ParsedGeneration[]
): ReturnType<LoraCollector['result']> {
  const loras = new LoraCollector()
  for (const generation of generations) {
    for (const lora of generation.loras ?? []) {
      loras.add(lora.name, { weight: lora.weight ?? undefined, hash: lora.hash ?? undefined })
    }
  }
  return loras.result()
}
