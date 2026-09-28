import { z } from 'zod'
import { DeleteFailure, DeleteMode } from './deletion-kinds'

export { DeleteFailure, DeleteMode } from './deletion-kinds'

const id = z.number().int().positive()

/** What happened to each image of a delete request. */
export const deleteReportSchema = z
  .object({
    /** The user declined the confirmation; nothing was deleted or forgotten. */
    cancelled: z.boolean(),
    /** Files deleted (or trashed), and their images removed from the library. */
    deleted: z.array(id).readonly(),
    /** Files already gone; their images were removed from the library. */
    missing: z.array(id).readonly(),
    failed: z
      .array(
        z
          .object({
            imageId: id,
            fileName: z.string(),
            reason: z.enum(DeleteFailure),
            /** The system error code (such as EACCES), never a message with paths. */
            code: z.string().max(32).optional()
          })
          .strict()
      )
      .readonly()
  })
  .strict()

export type DeleteReport = z.infer<typeof deleteReportSchema>
export type FailedDeletion = DeleteReport['failed'][number]

export const deleteModeSchema = z.enum(DeleteMode)
