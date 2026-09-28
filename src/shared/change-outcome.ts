// Runtime enum with no zod dependency, safe for the renderer bundle.

/** What happened to a change to a named item the user owns (a tag or an album). */
export enum ChangeOutcome {
  Done = 'done',
  /** Another item already has this name (compared case- and accent-insensitively by key). */
  Duplicate = 'duplicate',
  /** The item no longer exists. */
  Missing = 'missing'
}
