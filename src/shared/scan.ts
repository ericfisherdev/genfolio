import { z } from 'zod'
import { ScanEventType, ScanPhase } from './scan-kinds'

export { ScanEventType, ScanPhase } from './scan-kinds'

export const scanReportSchema = z
  .object({
    added: z.number().int(),
    updated: z.number().int(),
    unchanged: z.number().int(),
    removed: z.number().int(),
    /** Files that looked like images but could not be read or parsed. */
    failed: z.number().int()
  })
  .readonly()

export type ScanReport = z.infer<typeof scanReportSchema>

const rootId = z.number().int().positive()

export const scanEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal(ScanEventType.Progress),
      rootId,
      phase: z.enum(ScanPhase),
      done: z.number().int(),
      /** Null while the total is still unknown (walking). */
      total: z.number().int().nullable()
    })
    .readonly(),
  z
    .object({ type: z.literal(ScanEventType.Finished), rootId, report: scanReportSchema })
    .readonly(),
  z.object({ type: z.literal(ScanEventType.Failed), rootId, reason: z.string() }).readonly(),
  z
    .object({
      type: z.literal(ScanEventType.Hashing),
      /** Images hashed so far in this pass; the pass has ended when done equals total. */
      done: z.number().int().nonnegative(),
      total: z.number().int().nonnegative()
    })
    .readonly(),
  z.object({ type: z.literal(ScanEventType.WatchUnavailable), rootId }).readonly()
])

/** Scan lifecycle and background hashing notifications pushed from the service to the renderer. */
export type ScanEvent = z.infer<typeof scanEventSchema>
