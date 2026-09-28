import { z } from 'zod'
import { MAX_TAG_NAME, TagOutcome } from './tag-kinds'

export { MAX_TAG_NAME, TagOutcome } from './tag-kinds'

const id = z.number().int().positive()
/** Control characters (C0, DEL, C1) never belong in a name shown as a chip. */
function hasControlCharacter(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/** A tag name as typed: trimmed, 1–64 characters, no control characters. */
export const tagNameSchema = z
  .string()
  .transform((name) => name.trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(MAX_TAG_NAME)
      .refine((name) => !hasControlCharacter(name), 'control characters are not allowed')
  )

export const tagSchema = z
  .object({ id, name: z.string(), imageCount: z.number().int().nonnegative() })
  .strict()

export type Tag = z.infer<typeof tagSchema>

/** The result of creating or renaming a tag. */
export const tagChangeSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal(TagOutcome.Done), tag: tagSchema }).strict(),
  z.object({ outcome: z.literal(TagOutcome.Duplicate), existing: tagSchema }).strict(),
  z.object({ outcome: z.literal(TagOutcome.Missing) }).strict()
])

export type TagChange = z.infer<typeof tagChangeSchema>
