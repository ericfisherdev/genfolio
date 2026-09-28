// Runtime enums and constants with no zod dependency, safe for the renderer bundle.

/** Longest tag name, after trimming. */
export const MAX_TAG_NAME = 64

/** What happened to a tag change. */
export enum TagOutcome {
  Done = 'done',
  /** Another tag already has this name (compared case- and accent-insensitively by key). */
  Duplicate = 'duplicate',
  /** The tag no longer exists. */
  Missing = 'missing'
}
