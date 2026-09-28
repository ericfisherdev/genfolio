import type { GenerationParser, ParsedGeneration } from '@domain/generation'
import { generationFromFooocusFields } from './fooocus-fields'

/** Keys only Fooocus's JSON scheme writes; one is enough to tell it from other JSON. */
const FOOOCUS_KEYS = ['full_prompt', 'base_model', 'metadata_scheme', 'lora_combined_1']
/** SwarmUI also writes JSON parameters; it gets its own parser in a later phase. */
const SWARM_ROOT = 'sui_image_params'

/** Fooocus's `fooocus` metadata scheme: a JSON object of snake_case fields. */
export class FooocusJsonParser implements GenerationParser {
  parse(text: string): ParsedGeneration | undefined {
    const fields = jsonObject(text)
    if (!fields || SWARM_ROOT in fields || !FOOOCUS_KEYS.some((key) => key in fields)) {
      return undefined
    }
    return generationFromFooocusFields(fields)
  }
}

function jsonObject(text: string): Record<string, unknown> | undefined {
  if (!text.trimStart().startsWith('{')) return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}
