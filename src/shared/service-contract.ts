import { z } from 'zod'
import {
  directoryNodeSchema,
  galleryQuerySchema,
  imageCardSchema,
  imageLayoutSchema,
  MAX_IMAGES_PER_REQUEST
} from './gallery'
import { addRootResultSchema, rootSummarySchema } from './library'
import { serviceHealthSchema } from './service-health'

/** Methods the library service (utility process) answers over its parent port. */
export enum ServiceMethod {
  Health = 'health',
  ListRoots = 'roots.list',
  AddRoot = 'roots.add',
  RemoveRoot = 'roots.remove',
  RescanRoot = 'roots.rescan',
  GalleryLayout = 'gallery.layout',
  GalleryImages = 'gallery.images',
  DirectoryTree = 'gallery.directory-tree',
  RenderDisplayCopy = 'images.render-display-copy'
}

const noParams = z.object({}).strict()
const rootIdParams = z.object({ rootId: z.number().int().positive() }).strict()

/**
 * Parameter and result schemas per method: the service validates params, main validates
 * results. Adding a method means adding an entry here and a handler in the service.
 */
export const serviceContract = {
  [ServiceMethod.Health]: { params: noParams, result: serviceHealthSchema },
  [ServiceMethod.ListRoots]: { params: noParams, result: z.array(rootSummarySchema).readonly() },
  [ServiceMethod.AddRoot]: {
    params: z.object({ path: z.string().min(1) }).strict(),
    result: addRootResultSchema
  },
  [ServiceMethod.RemoveRoot]: { params: rootIdParams, result: z.object({ removed: z.boolean() }) },
  [ServiceMethod.RescanRoot]: { params: rootIdParams, result: z.object({ started: z.boolean() }) },
  [ServiceMethod.GalleryLayout]: {
    params: z.object({ query: galleryQuerySchema }).strict(),
    result: imageLayoutSchema
  },
  [ServiceMethod.GalleryImages]: {
    params: z
      .object({ ids: z.array(z.number().int().positive()).max(MAX_IMAGES_PER_REQUEST) })
      .strict(),
    result: z.array(imageCardSchema).readonly()
  },
  [ServiceMethod.DirectoryTree]: { params: rootIdParams, result: directoryNodeSchema.nullable() },
  [ServiceMethod.RenderDisplayCopy]: {
    params: z
      .object({
        imageId: z.number().int().positive(),
        maxWidth: z.number().int().min(64).max(4096)
      })
      .strict(),
    /** WebP bytes, or null when the image is unknown or its file is missing. */
    result: z.instanceof(Uint8Array).nullable()
  }
} as const satisfies { [M in ServiceMethod]: { params: z.ZodType; result: z.ZodType } }

export type ServiceParams = { [M in ServiceMethod]: z.infer<(typeof serviceContract)[M]['params']> }
export type ServiceResults = {
  [M in ServiceMethod]: z.infer<(typeof serviceContract)[M]['result']>
}
