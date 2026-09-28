import type {
  GenerationSourceParser,
  SourcedGeneration,
  StoredGeneration
} from '@domain/generation'
import { byPrecedence } from '@domain/generation-merger'
import type { ImageId } from '@domain/library'
import type { MetadataRecord } from '@domain/metadata-record'
import { modelIdentity } from '@domain/model-name'
import type { GenerationRepository, MetadataRecordRepository } from '@domain/repositories'
import type { GenerationDetails, GenerationResource, MetadataSource } from '@shared/generation'
import { ResourceKind } from '@shared/generation-kinds'
import type { MetadataOrigin } from '@shared/metadata-kinds'

/** What the detail page shows for an image: its stored generation, resources and raw sources. */
export class GenerationDetailsReader {
  constructor(
    private readonly generations: GenerationRepository,
    private readonly records: MetadataRecordRepository,
    private readonly parser: GenerationSourceParser
  ) {}

  /** `null` when the image has no generation (unknown image, or no metadata). */
  details(imageId: ImageId): GenerationDetails | null {
    const generation = this.generations.find(imageId)
    if (!generation) return null
    const records = this.records.list(imageId)
    const ranked = byPrecedence(this.parser.parse(records))
    return {
      generator: generation.generator,
      origin: generation.origin,
      prompt: generation.prompt ?? null,
      negativePrompt: generation.negativePrompt ?? null,
      seed: generation.seed ?? null,
      steps: generation.steps ?? null,
      cfgScale: generation.cfgScale ?? null,
      sampler: generation.sampler ?? null,
      scheduler: generation.scheduler ?? null,
      width: generation.width ?? null,
      height: generation.height ?? null,
      vae: generation.vae ?? null,
      styles: generation.styles ?? null,
      performance: generation.performance ?? null,
      resources: resourcesOf(generation, ranked),
      params: { ...generation.params },
      sources: groupByOrigin(records)
    }
  }
}

function resourcesOf(
  generation: StoredGeneration,
  ranked: readonly SourcedGeneration[]
): GenerationResource[] {
  const model = (kind: ResourceKind, ref: StoredGeneration['checkpoint']): GenerationResource[] =>
    ref ? [{ kind, name: ref.name, hash: ref.hash, weight: null, weightSource: null }] : []
  return [
    ...model(ResourceKind.Checkpoint, generation.checkpoint),
    ...model(ResourceKind.Refiner, generation.refiner),
    ...(generation.loras ?? []).map((lora) => ({
      kind: ResourceKind.Lora,
      name: lora.name,
      hash: lora.hash,
      weight: lora.weight,
      weightSource: lora.weight === null ? null : weightSource(lora.name, ranked)
    }))
  ]
}

/** The best source that gave this LoRA a weight, which is where the merged weight came from. */
function weightSource(name: string, ranked: readonly SourcedGeneration[]): MetadataOrigin | null {
  const identity = modelIdentity(name)
  const source = ranked.find((candidate) =>
    candidate.generation.loras?.some(
      (lora) => lora.weight !== null && modelIdentity(lora.name) === identity
    )
  )
  return source?.origin ?? null
}

function groupByOrigin(records: readonly MetadataRecord[]): MetadataSource[] {
  const groups = new Map<MetadataOrigin, { key: string; value: string }[]>()
  for (const record of records) {
    const group = groups.get(record.origin) ?? []
    group.push({ key: record.key, value: record.value })
    groups.set(record.origin, group)
  }
  return [...groups].map(([origin, entries]) => ({ origin, records: entries }))
}
