import { z } from 'zod'

export const rootSummarySchema = z
  .object({
    id: z.number().int().positive(),
    /** Absolute folder the user chose. */
    path: z.string(),
    addedAt: z.number(),
    imageCount: z.number().int().nonnegative(),
    scanning: z.boolean()
  })
  .readonly()

export type RootSummary = z.infer<typeof rootSummarySchema>

export enum AddRootOutcome {
  Added = 'added',
  /** The dialog was dismissed; produced by main, never by the service. */
  Cancelled = 'cancelled',
  AlreadyAdded = 'already-added',
  InsideExistingRoot = 'inside-existing-root',
  NotADirectory = 'not-a-directory'
}

/** The conflicting folder: the input path, the existing root, or its container. */
const conflictShape = { path: z.string() }

export const addRootResultSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      outcome: z.literal(AddRootOutcome.Added),
      root: rootSummarySchema,
      /** Existing roots inside the new folder that were merged into it. */
      absorbedRoots: z.number().int().nonnegative()
    })
    .readonly(),
  z.object({ outcome: z.literal(AddRootOutcome.AlreadyAdded), ...conflictShape }).readonly(),
  z.object({ outcome: z.literal(AddRootOutcome.InsideExistingRoot), ...conflictShape }).readonly(),
  z.object({ outcome: z.literal(AddRootOutcome.NotADirectory), ...conflictShape }).readonly()
])

export type AddRootResult = z.infer<typeof addRootResultSchema>

export type AddRootViaDialogResult = AddRootResult | { readonly outcome: AddRootOutcome.Cancelled }
