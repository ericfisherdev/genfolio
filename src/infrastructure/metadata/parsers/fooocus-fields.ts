import type { LoraUse, ModelRef, ParsedGeneration } from '@domain/generation'
import { generatorFromVersion } from '@domain/generator-version'
import { modelDisplayName, normalizeHash } from '@domain/model-name'
import { GeneratorKind } from '@shared/generation-kinds'
import { LoraCollector } from '@domain/lora-collector'
import { definedFields, parseDecimal, parseInteger, presentText } from './values'

const RESOLUTION = /^\(\s*(\d+)\s*,\s*(\d+)\s*\)$/
const PYTHON_STRING = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g
/** Far above any real style list; bounds PYTHON_STRING's rescans of unclosed quotes. */
const MAX_STYLES_REPR = 4096
const LORA_COMBINED = /^lora_combined_(\d+)$/
const COMBINED_SEPARATOR = ' : '

/**
 * A generation from Fooocus's snake_case fields, as its JSON metadata scheme and its log.html
 * entries write them. Values may be strings where JSON would have numbers (`seed`, and every
 * value in the log), and lists may be Python reprs (`styles`).
 */
export function generationFromFooocusFields(
  fields: Readonly<Record<string, unknown>>
): ParsedGeneration {
  const text = (key: string): string | undefined => presentText(asText(fields[key]))
  const resolution = RESOLUTION.exec(text('resolution') ?? '')
  return definedFields({
    generator: generatorFromVersion(text('version'), GeneratorKind.Fooocus),
    prompt: text('prompt'),
    negativePrompt: text('negative_prompt'),
    seed: text('seed'),
    steps: parseInteger(text('steps')),
    cfgScale: parseDecimal(text('guidance_scale')),
    sampler: text('sampler'),
    scheduler: text('scheduler'),
    width: parseInteger(resolution?.[1]),
    height: parseInteger(resolution?.[2]),
    checkpoint: modelRef(text('base_model'), text('base_model_hash')),
    refiner: modelRef(text('refiner_model'), text('refiner_model_hash')),
    vae: text('vae'),
    loras: lorasFrom(fields),
    styles: stylesFrom(fields['styles']),
    performance: text('performance'),
    params: paramsOf(fields)
  })
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function modelRef(name: string | undefined, hash: string | undefined): ModelRef | undefined {
  const displayName = name === undefined ? '' : modelDisplayName(name)
  return displayName ? { name: displayName, hash: normalizeHash(hash) } : undefined
}

/** `loras: [[name, weight, hash]]` first, then `lora_combined_N: "name : weight"`. */
function lorasFrom(fields: Readonly<Record<string, unknown>>): LoraUse[] | undefined {
  const loras = new LoraCollector()
  const listed = fields['loras']
  if (Array.isArray(listed)) {
    for (const entry of listed) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue
      loras.add(entry[0], { weight: parseDecimal(asText(entry[1])), hash: asText(entry[2]) })
    }
  }
  for (const [name, weight] of combinedLoras(fields)) {
    loras.add(name, { weight: parseDecimal(weight) })
  }
  return loras.result()
}

function combinedLoras(fields: Readonly<Record<string, unknown>>): [string, string][] {
  return Object.entries(fields)
    .map(([key, value]) => [Number(LORA_COMBINED.exec(key)?.[1]), value] as const)
    .filter(([index, value]) => Number.isInteger(index) && typeof value === 'string')
    .sort(([a], [b]) => a - b)
    .map(([, value]) => {
      const text = value as string
      const at = text.lastIndexOf(COMBINED_SEPARATOR)
      return at < 0 ? ['', ''] : [text.slice(0, at), text.slice(at + COMBINED_SEPARATOR.length)]
    })
}

/** A JSON list, or a Python repr like `['Fooocus V2', 'SAI Neonpunk']`. */
function stylesFrom(value: unknown): string[] | undefined {
  const styles = Array.isArray(value)
    ? value.filter((style): style is string => typeof style === 'string')
    : typeof value === 'string' && value.length <= MAX_STYLES_REPR
      ? [...value.matchAll(PYTHON_STRING)].map((match) => match[1] ?? match[2] ?? '')
      : []
  return styles.length > 0 ? styles : undefined
}

function paramsOf(fields: Readonly<Record<string, unknown>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
    ])
  )
}
