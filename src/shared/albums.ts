import { z } from 'zod'
import { AlbumKind, MAX_ALBUM_NAME } from './album-kinds'
import { ChangeOutcome } from './change-outcome'
import { userNameSchema } from './user-name'

export { AlbumKind, MAX_ALBUM_NAME, MAX_IDS_PER_ALBUM_EDIT } from './album-kinds'
export { ChangeOutcome } from './change-outcome'

const id = z.number().int().positive()

/** An album name as typed: trimmed, 1–100 characters, no control characters. */
export const albumNameSchema = userNameSchema(MAX_ALBUM_NAME)

export const albumSchema = z
  .object({
    id,
    name: z.string(),
    kind: z.enum(AlbumKind),
    imageCount: z.number().int().nonnegative(),
    /** The chosen cover, else the album's first image; null when it is empty. */
    coverImageId: id.nullable()
  })
  .strict()

export type Album = z.infer<typeof albumSchema>

/** The result of creating or renaming an album. */
export const albumChangeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal(ChangeOutcome.Done), album: albumSchema }).strict(),
  z.object({ outcome: z.literal(ChangeOutcome.Duplicate), existing: albumSchema }).strict(),
  z.object({ outcome: z.literal(ChangeOutcome.Missing) }).strict()
])

export type AlbumChange = z.infer<typeof albumChangeSchema>
