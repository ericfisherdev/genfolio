import { GenerationFormat, ResourceKind } from '@shared/generation-kinds'
import type { GenerationDetails, GenerationResource } from '@shared/generation'
import type { SourcedGeneration } from './generation'

/** Fooocus writes `name : weight`; its loader splits on the same separator. */
const LORA_SEPARATOR = ' : '
/** What A1111 assumes for a LoRA whose weight no source recorded; keeps the LoRA in the list. */
const UNKNOWN_LORA_WEIGHT = 1
/** Fooocus fields that name a model file. */
const MODEL_FILE_KEYS = new Set(['base_model', 'refiner_model', 'vae'])
const LORA_KEY = /^lora_combined_\d+$/
const FILE_EXTENSION = /\.[A-Za-z0-9]+$/

/** Whether a model-file field's value is a file name rather than a bare stem. */
function namesFile(key: string, value: string): boolean {
  const name = LORA_KEY.test(key) ? (value.split(LORA_SEPARATOR)[0] ?? '') : value
  return FILE_EXTENSION.test(name)
}

/**
 * The Fooocus fields of an image, merged across its Fooocus-format sources, or `undefined` when
 * none of the sources is one. Each field comes from the best source that has it, except that a
 * model field prefers a source giving the file name: Fooocus embeds model *stems* in the image
 * and writes the file names (with folder and extension) only to its log, and its prompt-box
 * loader puts the value into the model dropdown as is, so only a file name selects the model.
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
      const isModelField = MODEL_FILE_KEYS.has(key) || LORA_KEY.test(key)
      const upgrade = isModelField && !namesFile(key, current ?? '') && namesFile(key, value)
      if (current === undefined || upgrade) merged[key] = value
    }
  }
  return merged
}

const resourcesOf = (details: GenerationDetails, kind: ResourceKind): GenerationResource[] =>
  details.resources.filter((resource) => resource.kind === kind)

/**
 * The Fooocus fields the merged details can stand in for, under the keys Fooocus's parameter
 * loader reads. Values Fooocus evaluates as Python literals (`styles`, `resolution`) are written
 * as such. Absent fields are left out so the loader keeps the UI's current value.
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
    sampler: details.sampler,
    scheduler: details.scheduler,
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
