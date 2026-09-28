// Runtime enums with no zod dependency, safe for the renderer bundle.

export enum DeleteMode {
  /** To the system trash, from where the user can restore it. */
  Trash = 'trash',
  /** Removed from disk, only after a confirmation shown by main. */
  Permanent = 'permanent'
}

/** Why an image's file was not deleted. */
export enum DeleteFailure {
  /** The file could not be verified as this image's own file inside its root. */
  Refused = 'refused',
  /** The file is there but could not be opened. */
  Unreadable = 'unreadable',
  /** Moving it to the trash failed, and permanent deletion was declined. */
  TrashFailed = 'trash-failed',
  /** Removing it failed. */
  RemoveFailed = 'remove-failed'
}
