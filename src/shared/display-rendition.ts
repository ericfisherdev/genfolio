/** Images above this many pixels are shown in the grid as an in-memory downscaled copy. */
export const LARGE_IMAGE_PIXELS = 4_000_000

/** Width of the grid copy; cards are ~320 px wide, so this stays sharp on 2× displays. */
export const GRID_COPY_WIDTH = 600

export const IMAGE_SCHEME = 'genfolio'

export enum ImageDisplay {
  /** The original file, byte for byte. */
  Original = 'original',
  /** The grid rule: the original when small enough, otherwise the downscaled copy. */
  Grid = 'grid'
}

/** Whether the grid shows a downscaled copy instead of the original (never written to disk). */
export function usesGridCopy(width: number, height: number): boolean {
  return width * height > LARGE_IMAGE_PIXELS
}

/** URL of an image by id; paths never appear in image URLs. */
export function imageUrl(imageId: number, display: ImageDisplay): string {
  const base = `${IMAGE_SCHEME}://img/${imageId}`
  return display === ImageDisplay.Grid ? `${base}?display=${ImageDisplay.Grid}` : base
}
