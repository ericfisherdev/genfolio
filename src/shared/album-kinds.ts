// Runtime enums and constants with no zod dependency, safe for the renderer bundle.

/** Longest album name, after trimming. */
export const MAX_ALBUM_NAME = 100

/** Most images one album command (add, remove, move) accepts; the renderer chunks larger ones. */
export { MAX_IDS_PER_MARK as MAX_IDS_PER_ALBUM_EDIT } from './gallery-kinds'

export enum AlbumKind {
  /** Images the user added, in the order they arranged. */
  Manual = 'manual',
  /** A saved search, evaluated when opened. */
  Smart = 'smart'
}
