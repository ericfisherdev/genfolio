import { z } from 'zod'
import { MAX_PRESET_NAME, MAX_SLIDE_INTERVAL_MS, MIN_SLIDE_INTERVAL_MS } from './slideshow-kinds'
import { userNameSchema } from './user-name'

export { MAX_PRESET_NAME, MAX_SLIDE_INTERVAL_MS, MIN_SLIDE_INTERVAL_MS } from './slideshow-kinds'

export const slideshowSettingsSchema = z
  .object({
    intervalMs: z.number().int().min(MIN_SLIDE_INTERVAL_MS).max(MAX_SLIDE_INTERVAL_MS),
    /** A seeded order with no repeats until every image has shown. */
    shuffle: z.boolean(),
    /** Start over after the last image instead of stopping. */
    loop: z.boolean(),
    /** Show the prompt over the image. */
    showPrompt: z.boolean()
  })
  .strict()

export type SlideshowSettings = z.infer<typeof slideshowSettingsSchema>

export const presetNameSchema = userNameSchema(MAX_PRESET_NAME)

export const slideshowPresetSchema = z
  .object({ id: z.number().int().positive(), name: z.string(), settings: slideshowSettingsSchema })
  .strict()

export type SlideshowPreset = z.infer<typeof slideshowPresetSchema>
