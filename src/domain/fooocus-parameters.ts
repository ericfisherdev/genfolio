import { GenerationFormat, ResourceKind } from '@shared/generation-kinds'
import type { GenerationDetails, GenerationResource } from '@shared/generation'
import { fooocusSamplerKey, fooocusSchedulerName } from './fooocus-sampler-names'
import type { SourcedGeneration } from './generation'

/** Fooocus writes `name : weight`; its loader splits on the same separator. */
const LORA_SEPARATOR = ' : '
/** What A1111 assumes for a LoRA whose weight no source recorded; keeps the LoRA in the list. */
const UNKNOWN_LORA_WEIGHT = 1
/** Fooocus fields that name a model file. */
const MODEL_FILE_KEYS = new Set(['base_model', 'refiner_model', 'vae'])
const LORA_KEY = /^lora_combined_\d+$/

const isModelField = (key: string): boolean => MODEL_FILE_KEYS.has(key) || LORA_KEY.test(key)

/** The model a model-file field's value names (a LoRA's value also carries its weight). */
const modelName = (key: string, value: string): string =>
  LORA_KEY.test(key) ? (value.split(LORA_SEPARATOR)[0] ?? '') : value

/** Python's `Path(name).stem`, which Fooocus embeds in place of the file name. */
function stemOf(name: string): string {
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/** Whether `candidate` is the file name of the model `current` names by stem. */
const namesFileOf = (key: string, current: string, candidate: string): boolean =>
  candidate !== current && stemOf(modelName(key, candidate)) === modelName(key, current)

/**
 * The Fooocus fields of an image, merged across its Fooocus-format sources, or `undefined` when
 * none of the sources is one. Each field comes from the best source that has it, except that a
 * model field is replaced by a later source's file name of the same model: Fooocus embeds model
 * *stems* (`Path(name).stem`) in the image and writes the file names (with folder and extension)
 * only to its log, and its prompt-box loader puts the value into the model dropdown as is, so
 * only a file name selects the model.
 */
export function fooocusParamsOf(
  ranked: readonly SourcedGeneration[]
): Record<string, string> | undefined {
  const sources = ranked
    .filter((source) => source.format === GenerationFormat.FooocusJson)
    .map((source) => source.generation.params)
  if (sources.length === 0) return undefined
  const merged: Record<string, string> = {}
  for (const params of sources) {
    for (const [key, value] of Object.entries(params)) {
      const current = merged[key]
      if (current === undefined || (isModelField(key) && namesFileOf(key, current, value))) {
        merged[key] = value
      }
    }
  }
  return merged
}

const resourcesOf = (details: GenerationDetails, kind: ResourceKind): GenerationResource[] =>
  details.resources.filter((resource) => resource.kind === kind)

/**
 * The Fooocus fields the merged details can stand in for, under the keys Fooocus's parameter
 * loader reads. Values Fooocus evaluates as Python literals (`styles`, `resolution`) are written
 * as such, and A1111 sampler and scheduler names are mapped to Fooocus's. Absent fields, and
 * names Fooocus has no dropdown choice for, are left out so the loader keeps the UI's value.
 */
function derivedFields(details: GenerationDetails): Record<string, string | number> {
  const checkpoint = resourcesOf(details, ResourceKind.Checkpoint)[0]
  const refiner = resourcesOf(details, ResourceKind.Refiner)[0]
  const fields: Record<string, string | number | null | undefined> = {
    prompt: details.prompt,
    negative_prompt: details.negativePrompt,
    styles: details.styles ? JSON.stringify(details.styles) : undefined,
    performance: details.performance,
    steps: details.steps,
    resolution:
      details.width !== null && details.height !== null
        ? `(${details.width}, ${details.height})`
        : undefined,
    guidance_scale: details.cfgScale,
    base_model: checkpoint?.name,
    refiner_model: refiner?.name,
    sampler: details.sampler === null ? undefined : fooocusSamplerKey(details.sampler),
    scheduler: fooocusSchedulerName(details.scheduler, details.sampler),
    vae: details.vae,
    seed: details.seed
  }
  resourcesOf(details, ResourceKind.Lora).forEach((lora, index) => {
    const weight = lora.weight ?? UNKNOWN_LORA_WEIGHT
    fields[`lora_combined_${index + 1}`] = `${lora.name}${LORA_SEPARATOR}${weight}`
  })
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, string | number] =>
        entry[1] !== null && entry[1] !== undefined && entry[1] !== ''
    )
  )
}

/**
 * The generation as the JSON object Fooocus's prompt box accepts (paste it, then "Load
 * Parameters"). The image's own Fooocus fields are passed through whole, since they hold what
 * the merged fields don't (model file names, sharpness, ADM guidance, …); fields they lack, and
 * every field for other generators, come from the merged details.
 */
export function formatFooocusParameters(details: GenerationDetails): string {
  return JSON.stringify({ ...derivedFields(details), ...details.fooocusParams })
}
