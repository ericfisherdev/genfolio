const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

function decodeEntity(match: string, body: string): string {
  const named = NAMED_ENTITIES[body.toLowerCase()]
  if (named !== undefined) return named
  const code =
    body.startsWith('#x') || body.startsWith('#X')
      ? Number.parseInt(body.slice(2), 16)
      : body.startsWith('#')
        ? Number.parseInt(body.slice(1), 10)
        : Number.NaN
  return Number.isInteger(code) &&
    code > 0 &&
    code <= 0x10ffff &&
    !(code >= 0xd800 && code <= 0xdfff)
    ? String.fromCodePoint(code)
    : match
}

/**
 * Civitai's descriptions are HTML written by the model's author. This keeps the words and the
 * line structure and drops everything else, so the result is shown as plain text and nothing in
 * it is ever interpreted as markup. Null when nothing readable is left.
 */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|tr|blockquote|pre)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, decodeEntity)
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text === '' ? null : text
}
