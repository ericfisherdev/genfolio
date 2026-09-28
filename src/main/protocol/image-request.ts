import { ImageDisplay } from '@shared/display-rendition'

export interface ImageRequest {
  readonly imageId: number
  readonly display: ImageDisplay
}

const IMAGE_PATH = /^\/([1-9]\d{0,15})$/

/**
 * Parses `genfolio://img/<id>` and `genfolio://img/<id>?display=grid`. Anything else,
 * including extra path segments or encoded traversal, is `undefined` (served as 404).
 */
export function parseImageRequest(url: string): ImageRequest | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  const match = IMAGE_PATH.exec(parsed.pathname)
  if (parsed.host !== 'img' || !match) return undefined
  const display = parsed.searchParams.get('display')
  if (display !== null && display !== ImageDisplay.Grid) return undefined
  return {
    imageId: Number(match[1]),
    display: display === ImageDisplay.Grid ? ImageDisplay.Grid : ImageDisplay.Original
  }
}
