import { z } from 'zod'
import { ChangeOutcome } from './change-outcome'
import { MAX_TAG_NAME } from './tag-kinds'
import { userNameSchema } from './user-name'

export { ChangeOutcome } from './change-outcome'
export { MAX_TAG_NAME } from './tag-kinds'

const id = z.number().int().positive()

/** A tag name as typed: trimmed, 1–64 characters, no control characters. */
export const tagNameSchema = userNameSchema(MAX_TAG_NAME)

export const tagSchema = z
  .object({ id, name: z.string(), imageCount: z.number().int().nonnegative() })
  .strict()

export type Tag = z.infer<typeof tagSchema>

/** The result of creating or renaming a tag. */
export const tagChangeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal(ChangeOutcome.Done), tag: tagSchema }).strict(),
  z.object({ outcome: z.literal(ChangeOutcome.Duplicate), existing: tagSchema }).strict(),
  z.object({ outcome: z.literal(ChangeOutcome.Missing) }).strict()
])

export type TagChange = z.infer<typeof tagChangeSchema>
