import type { GenerationParser, LoraUse, ModelRef, ParsedGeneration } from '@domain/generation'
import { generatorFromVersion } from '@domain/generator-version'
import { modelDisplayName, normalizeHash } from '@domain/model-name'
import { GenerationFormat, GeneratorKind } from '@shared/generation-kinds'
import { LoraCollector } from '@domain/lora-collector'
import { definedFields, parseDecimal, parseInteger, presentText } from './values'

// Ported from A1111 modules/infotext_utils.py (re_param, re_imagesize, parse_generation_parameters).
// Python's \w is Unicode-aware, hence the \p classes. Two changes keep matching linear on
// hostile text: keys are capped at 128 characters, and the original's leading \s* is dropped
// (a key can't start with whitespace, so it never reached a capture, but it made every start
// in a long whitespace run rescan to its end).
const PARAM = /([\p{L}\p{N}_][\p{L}\p{N}_ \-/]{1,127}):\s*("(?:\\.|[^\\"])+"|[^,]*)(?:,|$)/gu
const IMAGE_SIZE = /^(\d+)x(\d+)$/
const NEGATIVE_PREFIX = 'Negative prompt:'
const MIN_PARAMS_ON_LAST_LINE = 3
/**
 * Bounded parts, so many unclosed `<lora:` prefixes can't make matching quadratic. The tail
 * may hold further arguments (`:te:unet:dyn`, `te=0.5:unet=0.8`, `lbw=…`).
 */
const LORA_TAG = /<lora:([^:>]{1,256})(?::([^:>]{0,32}))?(?::[^>]{0,512})?>/g
/** Only the trailing `[hash]`; the name is sliced off before it (a lazy name group backtracks). */
const TRAILING_HASH = /\[([0-9a-fA-F]+)\]$/

/**
 * A1111 infotext: prompt lines, an optional `Negative prompt:` section, and a last line of
 * `Key: value` pairs. Also reads the extras Fooocus writes in its a1111 scheme (`Raw prompt`,
 * `Lora weights`, `Scheduler`, …). Text whose last line has fewer than three pairs isn't
 * generation data (a camera's ImageDescription, say), so it is left to other parsers.
 */
export class A1111InfotextParser implements GenerationParser {
  readonly format = GenerationFormat.A1111Infotext

  parse(text: string): ParsedGeneration | undefined {
    const lines = text.trim().split('\n')
    const lastLine = lines.pop() ?? ''
    const params = paramsOf(lastLine)
    if (Object.keys(params).length < MIN_PARAMS_ON_LAST_LINE) return undefined
    const { prompt, negativePrompt } = splitPrompt(lines)
    return fieldsFrom(prompt, negativePrompt, params)
  }
}

/** Key/values of a params line, JSON-unquoting quoted values as A1111 does. */
function paramsOf(line: string): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [, key, value] of line.matchAll(PARAM)) {
    if (key === undefined || !value || key === '__proto__') continue
    params[key] = unquote(value)
  }
  return params
}

function unquote(value: string): string {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : value
  } catch {
    return value
  }
}

function splitPrompt(lines: readonly string[]): { prompt: string; negativePrompt: string } {
  const prompt: string[] = []
  const negative: string[] = []
  let inNegative = false
  for (const raw of lines) {
    let line = raw.trim()
    if (line.startsWith(NEGATIVE_PREFIX)) {
      inNegative = true
      line = line.slice(NEGATIVE_PREFIX.length).trim()
    }
    ;(inNegative ? negative : prompt).push(line)
  }
  return { prompt: prompt.join('\n'), negativePrompt: negative.join('\n') }
}

function fieldsFrom(
  prompt: string,
  negativePrompt: string,
  params: Record<string, string>
): ParsedGeneration {
  const size = IMAGE_SIZE.exec(params['Size'] ?? '')
  return definedFields({
    generator: generatorFromVersion(params['Version'], GeneratorKind.A1111),
    // Fooocus writes the style-expanded prompt as the prompt and what the user typed as
    // `Raw prompt`; the typed one is what people search for and copy.
    prompt: presentText(params['Raw prompt'] ?? prompt),
    negativePrompt: presentText(params['Raw negative prompt'] ?? negativePrompt),
    seed: presentText(params['Seed']),
    steps: parseInteger(params['Steps']),
    cfgScale: parseDecimal(params['CFG scale']),
    sampler: presentText(params['Sampler']),
    scheduler: presentText(params['Schedule type'] ?? params['Scheduler']),
    width: parseInteger(size?.[1]),
    height: parseInteger(size?.[2]),
    checkpoint: modelRef(params['Model'], params['Model hash']),
    refiner: modelRef(params['Refiner'], params['Refiner hash']),
    vae: presentText(params['VAE']),
    loras: lorasFrom(prompt, params),
    performance: presentText(params['Performance']),
    params
  })
}

/** A model named by `name`, which A1111 may write as `name [hash]`. */
function modelRef(name: string | undefined, hash: string | undefined): ModelRef | undefined {
  const named = presentText(name)
  if (named === undefined) return undefined
  const withHash = TRAILING_HASH.exec(named)
  const displayName = modelDisplayName(withHash ? named.slice(0, withHash.index) : named)
  if (!displayName) return undefined
  return { name: displayName, hash: normalizeHash(hash ?? withHash?.[1]) }
}

/** LoRA weight precedence within one infotext: `Lora weights` > legacy 3-part hashes > prompt tag. */
function lorasFrom(prompt: string, params: Record<string, string>): LoraUse[] | undefined {
  const loras = new LoraCollector()
  for (const [name, weight] of listEntries(params['Lora weights'])) {
    loras.add(name, { weight: parseDecimal(weight) })
  }
  for (const [name, hash, legacyWeight] of listEntries(params['Lora hashes'])) {
    loras.add(name, { hash, weight: parseDecimal(legacyWeight) })
  }
  for (const [, name, weight] of prompt.matchAll(LORA_TAG)) {
    if (name !== undefined) loras.add(name, { weight: tagWeight(weight) })
  }
  return loras.result()
}

/** A1111 reads a missing multiplier in `<lora:name>` as 1. */
function tagWeight(weight: string | undefined): number | undefined {
  return weight === undefined || weight.trim() === '' ? 1 : parseDecimal(weight)
}

/** `a: x, b: y` (or Fooocus's legacy `a: hash: weight`) as `[name, ...values]` tuples. */
function listEntries(list: string | undefined): [string, ...(string | undefined)[]][] {
  if (!list) return []
  return list
    .split(', ')
    .map((entry) => entry.split(': ').map((part) => part.trim()))
    .filter((parts): parts is [string, ...string[]] => parts.length >= 2 && parts[0] !== '')
}
