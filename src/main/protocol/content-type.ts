import { extname } from 'node:path'

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif'
}

/** MIME type for an indexed image file name; unknown extensions are generic binary. */
export function contentTypeFor(fileName: string): string {
  return CONTENT_TYPES[extname(fileName).toLowerCase()] ?? 'application/octet-stream'
}
