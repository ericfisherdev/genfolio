// Runtime constants with no zod dependency, safe for the renderer bundle.

/** Shortest and longest time an image stays on screen. */
export const MIN_SLIDE_INTERVAL_MS = 2_000
export const MAX_SLIDE_INTERVAL_MS = 60_000

/** Longest preset name, after trimming. */
export const MAX_PRESET_NAME = 64
