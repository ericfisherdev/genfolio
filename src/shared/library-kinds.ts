// Runtime enums with no zod dependency, safe for the renderer bundle.

export enum AddRootOutcome {
  Added = 'added',
  /** The dialog was dismissed; produced by main, never by the service. */
  Cancelled = 'cancelled',
  AlreadyAdded = 'already-added',
  InsideExistingRoot = 'inside-existing-root',
  NotADirectory = 'not-a-directory'
}
