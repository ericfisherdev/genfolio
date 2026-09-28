import { createHash } from 'node:crypto'

/** Short stable identifier for a file path, so logs never contain user paths. */
export function fileRef(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 12)
}
