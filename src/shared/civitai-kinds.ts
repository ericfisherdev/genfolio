// Runtime enum with no zod dependency, safe for the renderer bundle.

/** Base models to suggest when searching, as Civitai names them; any other name can be typed. */
export const COMMON_BASE_MODELS: readonly string[] = [
  'SDXL 1.0',
  'SD 1.5',
  'Pony',
  'Illustrious',
  'NoobAI',
  'Flux.1 D',
  'Flux.1 S',
  'SDXL Lightning',
  'SDXL Hyper',
  'SDXL Turbo',
  'SD 2.1',
  'SD 3.5',
  'Other'
]

/** What came of linking a model to Civitai. */
export enum CivitaiOutcome {
  Linked = 'linked',
  /** Civitai has no match (no file hash matched, or the model or version is gone). */
  NotFound = 'not-found',
  /** The local model no longer exists. */
  Missing = 'missing',
  /** The model was unlinked or linked elsewhere while Civitai was being asked. */
  Unlinked = 'unlinked'
}
