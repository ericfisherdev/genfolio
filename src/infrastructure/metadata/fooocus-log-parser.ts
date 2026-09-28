/** Whether a log entry describes a generation or only an upscale of another image. */
export enum LogEntryKind {
  Generation = 'generation',
  /** Fooocus logs a fast upscale as `{"upscale_fast": "2x"}`; it must never replace real data. */
  Upscale = 'upscale'
}

/** One image's entry in a Fooocus-family `log.html`. */
export interface FooocusLogEntry {
  readonly kind: LogEntryKind
  /**
   * The snake_case fields Fooocus logged (`prompt`, `base_model`, `lora_combined_1`, …).
   * Untrusted text from disk (table values are HTML-unescaped): display it only as text.
   */
  readonly fields: Readonly<Record<string, unknown>>
}

const SPLIT_MARKERS = ['<!--fooocus-log-split-->', '<!--unfooocused-log-split-->']
/** Entries always start a line; prompt text can't, since Fooocus writes its newlines as ` </br> `. */
const ENTRY_START = /^<div id="([^"]*)" class="image-container">/gm
const IMAGE_LINK = /<a href="([^"]+)"/
const CLIPBOARD_PAYLOAD = /to_clipboard\('([^']*)'\)/g
const ROW_START = "<tr><td class='label'>"
/** Anchored per row chunk, so a row without its closing tags costs one pass over its own chunk. */
const ROW_CELLS = /^([^<]*)<\/td><td class='value'>(.*?)<\/td><\/tr>/s
const UPSCALE_KEY = 'upscale_fast'
/** Table labels (Fooocus `save_and_log`) whose field keys aren't just the label in snake_case. */
const KEY_BY_LABEL = new Map([
  ['Fooocus V2 Expansion', 'prompt_expansion'],
  ['CFG Mimicking from TSNR', 'adaptive_cfg'],
  ['Upscale (Fast)', UPSCALE_KEY]
])
/** Fooocus only ever logs a bare file name; anything path- or URL-like is not one of its entries. */
const BARE_FILE_NAME = /^(?!\.\.?$)[^/\\:]+$/
const LORA_LABEL = /^LoRA (\d+)$/
const HTML_ENTITY = /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
}

/**
 * Reads a Fooocus, FwdFooocus or UnFooocused daily `log.html` into entries keyed by image file
 * name. Each entry's `to_clipboard('…')` payload (URI-encoded JSON) is the reliable source: the
 * HTML table is not escaped by Fooocus, so prompt text can break it. The table is only read,
 * HTML-unescaped, when an entry has no usable payload. Malformed entries are skipped, and the
 * newest entry (first in the file) wins when a name repeats. Never throws.
 */
export class FooocusLogParser {
  parse(html: string): Map<string, FooocusLogEntry> {
    const entries = new Map<string, FooocusLogEntry>()
    for (const [fileName, body] of entryBodies(logMiddle(html))) {
      if (entries.has(fileName)) continue
      const fields = payloadFields(body) ?? tableFields(body)
      if (fields) entries.set(fileName, { kind: kindOf(fields), fields })
    }
    return entries
  }
}

/** The part between the split markers, or the whole document when they're missing. */
function logMiddle(html: string): string {
  for (const marker of SPLIT_MARKERS) {
    const parts = html.split(marker)
    if (parts.length === 3) return parts[1] ?? ''
  }
  return html
}

/** `[fileName, entryHtml]` for each image-container div, in file order. */
function* entryBodies(middle: string): Generator<[string, string]> {
  const starts = [...middle.matchAll(ENTRY_START)]
  for (const [index, start] of starts.entries()) {
    const end = starts[index + 1]?.index ?? middle.length
    const body = middle.slice(start.index, end)
    const fileName = IMAGE_LINK.exec(body)?.[1] ?? fileNameFromDivId(start[1] ?? '')
    if (fileName && BARE_FILE_NAME.test(fileName)) yield [fileName, body]
  }
}

/** Fooocus derives the div id by replacing dots with `_`; the last one was the extension's. */
function fileNameFromDivId(id: string): string | undefined {
  const at = id.lastIndexOf('_')
  return at > 0 ? `${id.slice(0, at)}.${id.slice(at + 1)}` : undefined
}

/** The copy button follows the (unescaped) table, so its payload is the last one in the entry. */
/** Log payloads are untrusted; `__proto__` would re-prototype any object these fields are assigned into. */
const withoutProtoKeys = (key: string, value: unknown): unknown =>
  key === '__proto__' ? undefined : value

function payloadFields(body: string): Record<string, unknown> | undefined {
  const payload = [...body.matchAll(CLIPBOARD_PAYLOAD)].at(-1)?.[1]
  if (payload === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(payload), withoutProtoKeys)
    return isPlainObject(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function tableFields(body: string): Record<string, unknown> | undefined {
  const fields: Record<string, string> = {}
  for (const row of body.split(ROW_START).slice(1)) {
    const [, label, value] = ROW_CELLS.exec(row) ?? []
    const key = keyOfLabel(unescapeHtml(label ?? ''))
    if (key) fields[key] = unescapeHtml((value ?? '').replaceAll(' </br> ', '\n'))
  }
  return Object.keys(fields).length > 0 ? fields : undefined
}

function keyOfLabel(label: string): string | undefined {
  const lora = LORA_LABEL.exec(label)
  if (lora) return `lora_combined_${lora[1]}`
  const key = KEY_BY_LABEL.get(label) ?? label.trim().toLowerCase().replaceAll(/\s+/g, '_')
  return key || undefined
}

function unescapeHtml(text: string): string {
  return text.replaceAll(HTML_ENTITY, (entity, name: string) => {
    const lower = name.toLowerCase()
    if (lower.startsWith('#')) {
      const code = lower.startsWith('#x')
        ? parseInt(lower.slice(2), 16)
        : parseInt(lower.slice(1), 10)
      return code <= 0x10ffff ? String.fromCodePoint(code) : entity
    }
    return NAMED_ENTITIES[lower] ?? entity
  })
}

function kindOf(fields: Readonly<Record<string, unknown>>): LogEntryKind {
  const keys = Object.keys(fields)
  return keys.length > 0 && keys.every((key) => key === UPSCALE_KEY)
    ? LogEntryKind.Upscale
    : LogEntryKind.Generation
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
