/**
 * Widths the grid may ask a rendition in. A fixed set keeps the service cache and the
 * browser cache to a few variants per image; the renderer picks the smallest that covers
 * its cards at the screen's pixel ratio.
 */
export const GRID_RENDITION_WIDTHS = [400, 600, 800] as const

export type GridRenditionWidth = (typeof GRID_RENDITION_WIDTHS)[number]

export const DEFAULT_GRID_RENDITION_WIDTH: GridRenditionWidth = 400

export const IMAGE_SCHEME = 'genfolio'

export enum ImageDisplay {
  /** The original file, byte for byte. */
  Original = 'original',
  /** A WebP rendition at most `width` wide; the original when it is already narrower. */
  Grid = 'grid'
}

export const isGridRenditionWidth = (value: number): value is GridRenditionWidth =>
  (GRID_RENDITION_WIDTHS as readonly number[]).includes(value)

/** The smallest rendition width that shows a `cardWidth` CSS px card sharp at `pixelRatio`. */
export function gridRenditionWidth(cardWidth: number, pixelRatio: number): GridRenditionWidth {
  const needed = cardWidth * pixelRatio
  return GRID_RENDITION_WIDTHS.find((width) => width >= needed) ?? GRID_RENDITION_WIDTHS.at(-1)!
}

/** Whether the grid shows a rendition instead of the original (which is never upscaled). */
export function usesGridCopy(imageWidth: number, renditionWidth: number): boolean {
  return imageWidth > renditionWidth
}

export interface ImageUrlOptions {
  /**
   * The file's version from the layout. A URL carrying it is served as immutable, so the
   * browser caches it until the file changes and the version with it; without one the
   * response is `no-store`.
   */
  readonly version?: number
  /** Grid only; the default width when omitted. */
  readonly width?: GridRenditionWidth
}

/** URL of an image by id; paths never appear in image URLs. */
export function imageUrl(
  imageId: number,
  display: ImageDisplay,
  options: ImageUrlOptions = {}
): string {
  const params = new URLSearchParams()
  if (display === ImageDisplay.Grid) {
    params.set('display', ImageDisplay.Grid)
    params.set('w', String(options.width ?? DEFAULT_GRID_RENDITION_WIDTH))
  }
  if (options.version !== undefined) params.set('v', String(options.version))
  const query = params.toString()
  return `${IMAGE_SCHEME}://img/${imageId}${query ? `?${query}` : ''}`
}
