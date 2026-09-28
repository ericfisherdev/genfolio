export const TARGET_COLUMN_WIDTH = 320
export const GRID_GAP = 12

export interface GridGeometry {
  readonly lanes: number
  readonly columnWidth: number
}

/** Columns that fit `width` at roughly the target width, and the exact width of each. */
export function gridGeometry(
  width: number,
  targetColumnWidth = TARGET_COLUMN_WIDTH,
  gap = GRID_GAP
): GridGeometry {
  const lanes = Math.max(1, Math.floor((width + gap) / (targetColumnWidth + gap)))
  const columnWidth = Math.max(1, (width - gap * (lanes - 1)) / lanes)
  return { lanes, columnWidth }
}

/** Card height for an image shown `columnWidth` wide, keeping its aspect ratio. */
export function cardHeight(columnWidth: number, width: number, height: number): number {
  return Math.round((columnWidth * height) / width)
}
