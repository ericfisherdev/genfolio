import { CopyVariant, ResourceKind } from '@shared/generation-kinds'
import type { GenerationDetails, GenerationResource } from '@shared/generation'

/** A1111's `quote`: values holding `,`, `:` or a newline are written as JSON strings. */
function quote(value: string): string {
  return /[,:\n]/.test(value) ? JSON.stringify(value) : value
}

const resourcesOf = (details: GenerationDetails, kind: ResourceKind): GenerationResource[] =>
  details.resources.filter((resource) => resource.kind === kind)

/** `a: x, b: y` for the LoRAs that have the value. */
function loraList(
  loras: readonly GenerationResource[],
  valueOf: (lora: GenerationResource) => string | null
): string | undefined {
  const entries = loras.flatMap((lora) => {
    const value = valueOf(lora)
    return value === null ? [] : [`${lora.name}: ${value}`]
  })
  return entries.length > 0 ? entries.join(', ') : undefined
}

/** The params line, in A1111's key order; keys without a value are left out. */
function paramsLine(details: GenerationDetails): string {
  const checkpoint = resourcesOf(details, ResourceKind.Checkpoint)[0]
  const refiner = resourcesOf(details, ResourceKind.Refiner)[0]
  const loras = resourcesOf(details, ResourceKind.Lora)
  const size =
    details.width !== null && details.height !== null
      ? `${details.width}x${details.height}`
      : undefined
  const params: [string, string | number | null | undefined][] = [
    ['Steps', details.steps],
    ['Sampler', details.sampler],
    ['Schedule type', details.scheduler],
    ['CFG scale', details.cfgScale],
    ['Seed', details.seed],
    ['Size', size],
    ['Model hash', checkpoint?.hash],
    ['Model', checkpoint?.name],
    ['VAE', details.vae],
    ['Refiner', refiner?.name],
    ['Refiner hash', refiner?.hash],
    ['Lora hashes', loraList(loras, (lora) => lora.hash)],
    [
      'Lora weights',
      loraList(loras, (lora) => (lora.weight === null ? null : String(lora.weight)))
    ],
    ['Performance', details.performance],
    ['Version', details.params['version'] ?? details.params['Version']]
  ]
  return params
    .filter(
      (entry): entry is [string, string | number] =>
        entry[1] !== null && entry[1] !== undefined && entry[1] !== ''
    )
    .map(([key, value]) => `${key}: ${quote(String(value))}`)
    .join(', ')
}

/** A1111 infotext: prompt, `Negative prompt:` line, params line. */
export function formatInfotext(details: GenerationDetails): string {
  const lines = [details.prompt ?? '']
  if (details.negativePrompt) lines.push(`Negative prompt: ${details.negativePrompt}`)
  lines.push(paramsLine(details))
  return lines.join('\n').trim()
}

/**
 * The prompt with a `<lora:name:weight>` tag for every LoRA it doesn't already tag
 * (`<lora:name>` when the weight is unknown, which A1111 reads as 1).
 */
export function promptWithLoraTags(details: GenerationDetails): string {
  const prompt = details.prompt ?? ''
  const tags = resourcesOf(details, ResourceKind.Lora)
    .filter(
      (lora) => !prompt.includes(`<lora:${lora.name}:`) && !prompt.includes(`<lora:${lora.name}>`)
    )
    .map((lora) =>
      lora.weight === null ? `<lora:${lora.name}>` : `<lora:${lora.name}:${lora.weight}>`
    )
  return [prompt, ...tags].filter((part) => part !== '').join(' ')
}

/** The text a copy action puts on the clipboard, or `null` when there's none. */
export function generationText(details: GenerationDetails, variant: CopyVariant): string | null {
  const text = {
    [CopyVariant.Prompt]: () => details.prompt ?? '',
    [CopyVariant.PromptWithLoras]: () => promptWithLoraTags(details),
    [CopyVariant.Negative]: () => details.negativePrompt ?? '',
    [CopyVariant.All]: () => formatInfotext(details)
  }[variant]()
  return text === '' ? null : text
}
