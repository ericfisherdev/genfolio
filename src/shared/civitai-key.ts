import { z } from 'zod'

/** A Civitai API key as typed: letters, digits, dashes and underscores. */
export const civitaiKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{16,128}$/, 'That does not look like a Civitai API key')

/** Whether a key is saved and whether this computer can keep one safely; the key is never sent back. */
export const civitaiKeyStatusSchema = z
  .object({ hasKey: z.boolean(), canStore: z.boolean() })
  .strict()

export type CivitaiKeyStatus = z.infer<typeof civitaiKeyStatusSchema>
