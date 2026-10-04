import {
  DEFAULT_GRID_RENDITION_WIDTH,
  ImageDisplay,
  isGridRenditionWidth,
  type GridRenditionWidth
} from '@shared/display-rendition'

export type ImageRequest =
  | { readonly imageId: number; readonly display: ImageDisplay.Original }
  | {
      readonly imageId: number
      readonly display: ImageDisplay.Grid
      readonly width: GridRenditionWidth
    }

const IMAGE_PATH = /^\/([1-9]\d{0,15})$/

/**
 * Parses `genfolio://img/<id>` and `genfolio://img/<id>?display=grid&w=<width>`. Anything
 * else, including extra path segments, encoded traversal, a width outside the fixed set or a
 * `w` without the grid, is `undefined` (served as 404).
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
  const imageId = Number(match[1])
  const display = parsed.searchParams.get('display')
  const widthParam = parsed.searchParams.get('w')
  if (display === null) {
    return widthParam === null ? { imageId, display: ImageDisplay.Original } : undefined
  }
  if (display !== ImageDisplay.Grid) return undefined
  const width = widthParam === null ? DEFAULT_GRID_RENDITION_WIDTH : Number(widthParam)
  if (!isGridRenditionWidth(width)) return undefined
  return { imageId, display: ImageDisplay.Grid, width }
}
