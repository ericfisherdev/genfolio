import { KeywordScope, SetMatchMode } from '@shared/search-kinds'

/** One thing to look for: a word or a phrase, optionally matching as a prefix. */
export interface KeywordTerm {
  readonly text: string
  readonly prefix: boolean
}

export interface KeywordQuery {
  readonly include: readonly KeywordTerm[]
  readonly exclude: readonly KeywordTerm[]
}

/** A term the tokenizer would find nothing in (only punctuation) can't match anything. */
const HAS_TOKEN = /[\p{L}\p{N}]/u
const WHITESPACE = /\s/u

/**
 * Reads what the user typed: space-separated words, `"quoted phrases"` (an unclosed quote runs
 * to the end), a leading `-` to exclude, and a trailing `*` for a prefix. Everything else is
 * literal text: FTS5 operators and punctuation have no special meaning here. Never throws.
 */
export function parseKeywords(input: string): KeywordQuery {
  const include: KeywordTerm[] = []
  const exclude: KeywordTerm[] = []
  let index = 0
  while (index < input.length) {
    while (index < input.length && WHITESPACE.test(input[index] ?? '')) index++
    if (index >= input.length) break
    const excluded = input[index] === '-'
    if (excluded) index++
    let raw: string
    if (input[index] === '"') {
      const close = input.indexOf('"', index + 1)
      const end = close < 0 ? input.length : close
      raw = input.slice(index + 1, end)
      index = end + 1
      if (input[index] === '*') {
        raw += '*'
        index++
      }
    } else {
      const start = index
      while (index < input.length && !WHITESPACE.test(input[index] ?? '')) index++
      raw = input.slice(start, index)
    }
    const term = termOf(raw)
    if (term) (excluded ? exclude : include).push(term)
  }
  return { include, exclude }
}

function termOf(raw: string): KeywordTerm | undefined {
  const prefix = raw.endsWith('*')
  const text = raw.replaceAll('*', '').replaceAll('"', ' ').trim()
  return HAS_TOKEN.test(text) ? { text, prefix } : undefined
}

const COLUMNS: Readonly<Record<KeywordScope, string>> = {
  [KeywordScope.Positive]: '{prompt}',
  [KeywordScope.Negative]: '{negative_prompt}',
  [KeywordScope.Both]: '{prompt negative_prompt}'
}

/** A term as an FTS5 string: quoted (so it's never read as syntax), `*` outside for prefixes. */
const ftsString = (term: KeywordTerm): string =>
  `"${term.text.replaceAll('"', '""')}"${term.prefix ? '*' : ''}`

/**
 * An FTS5 MATCH expression over the scope's columns requiring every term (`All`) or at least
 * one (`Any`), or `undefined` when there are no terms. Built only from quoted strings, so
 * any input yields valid syntax.
 */
export function matchExpression(
  terms: readonly KeywordTerm[],
  scope: KeywordScope,
  mode: SetMatchMode
): string | undefined {
  if (terms.length === 0) return undefined
  const operator = mode === SetMatchMode.All ? ' AND ' : ' OR '
  return `${COLUMNS[scope]} : (${terms.map(ftsString).join(operator)})`
}
