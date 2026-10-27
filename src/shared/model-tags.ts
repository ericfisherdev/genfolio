import { z } from 'zod'
import { ChangeOutcome } from './change-outcome'
import { MAX_TAG_NAME } from './tag-kinds'
import { userNameSchema } from './user-name'

export { ChangeOutcome } from './change-outcome'

const id = z.number().int().positive()

/** A model tag name as typed: trimmed, 1–64 characters, no control characters. */
export const modelTagNameSchema = userNameSchema(MAX_TAG_NAME)

/** A model tag as a model carries it. */
export const modelTagRefSchema = z.object({ id, name: z.string() }).strict()

export type ModelTagRef = z.infer<typeof modelTagRefSchema>

/** A model tag with how many listed models carry it. */
export const modelTagSchema = modelTagRefSchema
  .extend({ modelCount: z.number().int().nonnegative() })
  .strict()

export type ModelTag = z.infer<typeof modelTagSchema>

/** The result of creating or renaming a model tag. */
export const modelTagChangeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal(ChangeOutcome.Done), tag: modelTagSchema }).strict(),
  z.object({ outcome: z.literal(ChangeOutcome.Duplicate), existing: modelTagSchema }).strict(),
  z.object({ outcome: z.literal(ChangeOutcome.Missing) }).strict()
])

export type ModelTagChange = z.infer<typeof modelTagChangeSchema>
