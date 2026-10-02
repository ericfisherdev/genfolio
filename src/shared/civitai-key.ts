import { z } from 'zod'

/** A Civitai API key as typed: letters, digits, dashes and underscores. */
export const civitaiKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{16,128}$/, 'That does not look like a Civitai API key')

/**
 * Whether a key is saved; the key is never sent back. Whether this computer can keep one
 * safely is not asked here: that means contacting the system keyring, which can take a long
 * time, so it is found out only when a key is saved or used.
 */
export const civitaiKeyStatusSchema = z.object({ hasKey: z.boolean() }).strict()

export type CivitaiKeyStatus = z.infer<typeof civitaiKeyStatusSchema>
