import { z } from 'zod'

/** Versions and capabilities of the native stack, as observed inside the library service. */
export const serviceHealthSchema = z
  .object({
    electron: z.string(),
    node: z.string(),
    sqlite: z.string(),
    fts5: z.boolean(),
    /** Formats the image codec decoded successfully in this process. */
    decodableFormats: z.array(z.string()).readonly()
  })
  .readonly()

export type ServiceHealth = z.infer<typeof serviceHealthSchema>
