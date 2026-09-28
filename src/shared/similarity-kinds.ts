// Runtime constants with no zod dependency, safe for the renderer bundle.

/** Largest Hamming distance (of 64 bits) a stored pair can have; thresholds stay at or below. */
export const MAX_SIMILARITY_DISTANCE = 16

/** The default grouping threshold: "similar" (≤ 4 is near-identical). */
export const DEFAULT_SIMILARITY_THRESHOLD = 10

/** Distances at or below this are near-identical copies. */
export const NEAR_IDENTICAL_DISTANCE = 4
