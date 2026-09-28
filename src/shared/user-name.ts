import { z } from 'zod'

/** Control characters (C0, DEL, C1) never belong in a name shown as a chip or a title. */
function hasControlCharacter(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

/** A name the user typed for something they own: trimmed, 1–`max` characters, no controls. */
export function userNameSchema(max: number): z.ZodType<string, string> {
  return z
    .string()
    .transform((name) => name.trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(max)
        .refine((name) => !hasControlCharacter(name), 'control characters are not allowed')
    )
}
