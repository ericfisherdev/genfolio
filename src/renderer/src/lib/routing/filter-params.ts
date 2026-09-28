import { GeneratorKind } from '@shared/generation-kinds'
import { KeywordScope, SetMatchMode } from '@shared/search-kinds'
import type { SearchFilters } from '@shared/search'

// Search filters as hash query parameters, e.g. `?ckpt=4,9&lora=2&lmode=all&q=red+hair`.
// Parsing is lenient: an invalid parameter is dropped, never an error.

const MAX_IDS = 200
const MAX_QUERY = 1000
const MAX_SEED = 40
const POSITIVE_INT = /^[1-9]\d{0,9}$/
const GENERATORS = new Set<string>(Object.values(GeneratorKind))
const SCOPES = new Set<string>(Object.values(KeywordScope))

function idList(value: string | null): number[] | undefined {
  if (!value) return undefined
  const parts = value.split(',')
  if (parts.length > MAX_IDS || !parts.every((part) => POSITIVE_INT.test(part))) return undefined
  return [...new Set(parts.map(Number))]
}

function finite(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

/** Adds `[key, value]` only when `value` is defined, keeping optional fields absent. */
function defined<T extends object>(entries: [keyof T, unknown][]): T {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as T
}

/** Both bounds, or neither when they're inverted (the service rejects min > max). */
function weightRange(params: URLSearchParams): { min?: number; max?: number } {
  const min = finite(params.get('lmin'))
  const max = finite(params.get('lmax'))
  if (min !== undefined && max !== undefined && min > max) return {}
  return defined([
    ['min', min],
    ['max', max]
  ])
}

export function parseFilters(params: URLSearchParams): SearchFilters | undefined {
  const loraIds = idList(params.get('lora'))
  const weights = weightRange(params)
  const query = params.get('q')
  const scope = params.get('qs')
  const generators = params
    .get('gen')
    ?.split(',')
    .filter((kind): kind is GeneratorKind => GENERATORS.has(kind))
  const seed = params.get('seed')
  const same = params.get('same')
  const meta = params.get('meta')
  const filters = defined<SearchFilters>([
    ['checkpointIds', idList(params.get('ckpt'))],
    [
      'loras',
      loraIds &&
        defined<NonNullable<SearchFilters['loras']>>([
          ['ids', loraIds],
          ['mode', params.get('lmode') === SetMatchMode.All ? SetMatchMode.All : SetMatchMode.Any],
          ['minWeight', weights.min],
          ['maxWeight', weights.max]
        ])
    ],
    [
      'keywords',
      query && query.trim() !== '' && query.length <= MAX_QUERY
        ? {
            query,
            scope:
              scope !== null && SCOPES.has(scope) ? (scope as KeywordScope) : KeywordScope.Positive
          }
        : undefined
    ],
    ['generators', generators && generators.length > 0 ? [...new Set(generators)] : undefined],
    ['seed', seed && seed.length <= MAX_SEED ? seed : undefined],
    ['samePromptAs', same !== null && POSITIVE_INT.test(same) ? Number(same) : undefined],
    ['hasMetadata', meta === '1' ? true : meta === '0' ? false : undefined]
  ])
  return Object.keys(filters).length > 0 ? filters : undefined
}

/** Writes the filters in a fixed order, so equal filters always give the same text. */
export function writeFilters(filters: SearchFilters | undefined, params: URLSearchParams): void {
  if (!filters) return
  const set = (key: string, value: string | number | undefined): void => {
    if (value !== undefined) params.set(key, String(value))
  }
  set('ckpt', filters.checkpointIds?.join(','))
  set('lora', filters.loras?.ids.join(','))
  set('lmode', filters.loras?.mode === SetMatchMode.All ? SetMatchMode.All : undefined)
  set('lmin', filters.loras?.minWeight)
  set('lmax', filters.loras?.maxWeight)
  set('q', filters.keywords?.query)
  set('qs', filters.keywords?.scope === KeywordScope.Positive ? undefined : filters.keywords?.scope)
  set('gen', filters.generators?.join(','))
  set('seed', filters.seed)
  set('same', filters.samePromptAs)
  set('meta', filters.hasMetadata === undefined ? undefined : filters.hasMetadata ? 1 : 0)
}

/** A canonical text for the filters (empty when there are none), for keys and comparisons. */
export function filtersKey(filters: SearchFilters | undefined): string {
  const params = new URLSearchParams()
  writeFilters(filters, params)
  return params.toString()
}
