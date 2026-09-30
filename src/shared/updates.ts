import { z } from 'zod'
import { UpdatePhase } from './update-kinds'

export { InstallMethod, UpdatePhase } from './update-kinds'

/** Download progress, only while downloading. */
export const updateProgressSchema = z
  .object({
    percent: z.number().min(0).max(100),
    transferredBytes: z.number().int().nonnegative(),
    totalBytes: z.number().int().nonnegative()
  })
  .strict()

export type UpdateProgress = z.infer<typeof updateProgressSchema>

/** One step of an update, as main reports it to the renderer's notice bar. */
export const updateEventSchema = z
  .object({
    phase: z.enum(UpdatePhase),
    /** The version being offered, downloaded or installed; null while checking or when none. */
    version: z.string().nullable(),
    progress: updateProgressSchema.nullable(),
    /** Why the update failed, for the user; null otherwise. */
    message: z.string().nullable()
  })
  .strict()

export type UpdateEvent = z.infer<typeof updateEventSchema>
