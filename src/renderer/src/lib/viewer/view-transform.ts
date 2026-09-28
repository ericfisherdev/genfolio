/** Image placement in the viewer: `x`,`y` is the image's top-left corner in viewport pixels. */
export interface ViewTransform {
  readonly scale: number
  readonly x: number
  readonly y: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

export const MIN_SCALE = 0.05
export const MAX_SCALE = 8

const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

/** Scale that fits the image inside the viewport, never enlarging it past actual size. */
export function fitScale(image: Size, viewport: Size): number {
  if (image.width <= 0 || image.height <= 0) return 1
  return Math.min(1, viewport.width / image.width, viewport.height / image.height)
}

/** The image centred in the viewport at `scale`. */
export function centered(image: Size, viewport: Size, scale: number): ViewTransform {
  return {
    scale,
    x: (viewport.width - image.width * scale) / 2,
    y: (viewport.height - image.height * scale) / 2
  }
}

/** Zooms by `factor` keeping the image point under `cursor` fixed on screen. */
export function zoomAt(
  transform: ViewTransform,
  factor: number,
  cursor: { readonly x: number; readonly y: number }
): ViewTransform {
  const scale = clampScale(transform.scale * factor)
  const ratio = scale / transform.scale
  return {
    scale,
    x: cursor.x - (cursor.x - transform.x) * ratio,
    y: cursor.y - (cursor.y - transform.y) * ratio
  }
}

export function panBy(transform: ViewTransform, dx: number, dy: number): ViewTransform {
  return { ...transform, x: transform.x + dx, y: transform.y + dy }
}

/** Wheel delta to zoom factor: one notch (~100 px) zooms about 10%. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY / 1000)
}
