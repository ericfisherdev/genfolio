import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export enum LogLevel {
  Warn = 'WARN',
  Error = 'ERROR'
}

export interface RotatingLogOptions {
  /** Past this size, the file is rotated before the next line. */
  readonly maxBytes: number
  /** Files kept, the current one included (`name.log`, `name.1.log`, …). */
  readonly keep: number
}

export const DEFAULT_LOG_OPTIONS: RotatingLogOptions = { maxBytes: 1_000_000, keep: 3 }

/**
 * Appends lines to `<dir>/<name>.log`, rotating by size. Callers must never pass paths or
 * prompts: messages carry file refs and error names only. Writing never throws; a log that
 * can't be written is simply lost.
 */
export class RotatingFileLog {
  private readonly path: string

  constructor(
    private readonly dir: string,
    private readonly name: string,
    private readonly options: RotatingLogOptions = DEFAULT_LOG_OPTIONS,
    private readonly now: () => Date = () => new Date()
  ) {
    this.path = join(dir, `${name}.log`)
  }

  write(level: LogLevel, message: string): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      this.rotateIfFull()
      appendFileSync(this.path, `${this.now().toISOString()} ${level} ${message}\n`)
    } catch {
      // Logging must never take the app down.
    }
  }

  private rotateIfFull(): void {
    let size: number
    try {
      size = statSync(this.path).size
    } catch {
      return
    }
    if (size < this.options.maxBytes) return
    const numbered = (n: number): string => join(this.dir, `${this.name}.${n}.log`)
    rmSync(numbered(this.options.keep - 1), { force: true })
    for (let n = this.options.keep - 2; n >= 1; n--) {
      try {
        renameSync(numbered(n), numbered(n + 1))
      } catch {
        // That generation doesn't exist yet.
      }
    }
    renameSync(this.path, numbered(1))
  }
}

/**
 * An error as it may be logged: its name and system code, never its message, which can
 * hold paths.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return typeof error
  const code = (error as NodeJS.ErrnoException).code
  return code ? `${error.name} (${code})` : error.name
}
