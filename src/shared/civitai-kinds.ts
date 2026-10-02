// Runtime enum with no zod dependency, safe for the renderer bundle.

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
