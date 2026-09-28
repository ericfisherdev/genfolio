import type { FileStamp } from './repositories'

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

/** Parses a daily `log.html` into entries keyed by bare image file name. Never throws. */
export interface FooocusLogFormat {
  parse(html: string): Map<string, FooocusLogEntry>
}

/** The file name Fooocus-family tools write their daily log to. */
export const FOOOCUS_LOG_FILE_NAME = 'log.html'

/** Reads `log.html` files: the stamp to detect changes, then the text. */
export interface LogFileSource {
  /** The size and whole-millisecond mtime, or `undefined` when there's no regular file. */
  stat(path: string): Promise<FileStamp | undefined>
  /** The text, or `undefined` when it can't be read or is too large to parse. */
  read(path: string): Promise<string | undefined>
}
