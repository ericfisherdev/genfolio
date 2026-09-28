import { z } from 'zod'
import {
  directoryNodeSchema,
  galleryQuerySchema,
  imageCardSchema,
  imageLayoutSchema,
  MAX_IMAGES_PER_REQUEST,
  MAX_IDS_PER_MARK,
  MAX_RATING
} from './gallery'
import { CopyVariant, generationDetailsSchema } from './generation'
import { addRootResultSchema, rootSummarySchema } from './library'
import { searchFacetsSchema } from './search'
import { tagChangeSchema, tagNameSchema, tagSchema } from './tags'
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
  RenderDisplayCopy = 'images.render-display-copy',
  ImageGeneration = 'images.generation',
  ImageGenerationText = 'images.generation-text',
  SearchFacets = 'search.facets',
  SetFavorite = 'images.set-favorite',
  SetRating = 'images.set-rating',
  TagsList = 'tags.list',
  TagsOfImage = 'tags.of-image',
  TagsCreate = 'tags.create',
  TagsRename = 'tags.rename',
  TagsMerge = 'tags.merge',
  TagsDelete = 'tags.delete',
  TagsApply = 'tags.apply',
  TagsRemove = 'tags.remove'
}

const noParams = z.object({}).strict()
const rootIdParams = z.object({ rootId: z.number().int().positive() }).strict()
const imageIdParams = z.object({ imageId: z.number().int().positive() }).strict()
const markIds = z.array(z.number().int().positive()).min(1).max(MAX_IDS_PER_MARK)
const tagId = z.number().int().positive()
const tagIds = z.array(tagId).min(1).max(200)

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
  [ServiceMethod.SearchFacets]: {
    params: z.object({ query: galleryQuerySchema }).strict(),
    result: searchFacetsSchema
  },
  [ServiceMethod.SetFavorite]: {
    params: z.object({ ids: markIds, favorite: z.boolean() }).strict(),
    /** How many of the images exist and were set. */
    result: z.object({ changed: z.number().int().nonnegative() })
  },
  [ServiceMethod.SetRating]: {
    params: z.object({ ids: markIds, rating: z.number().int().min(0).max(MAX_RATING) }).strict(),
    result: z.object({ changed: z.number().int().nonnegative() })
  },
  [ServiceMethod.TagsList]: { params: noParams, result: z.array(tagSchema).readonly() },
  [ServiceMethod.TagsOfImage]: { params: imageIdParams, result: z.array(tagSchema).readonly() },
  [ServiceMethod.TagsCreate]: {
    params: z.object({ name: tagNameSchema }).strict(),
    result: tagChangeSchema
  },
  [ServiceMethod.TagsRename]: {
    params: z.object({ id: tagId, name: tagNameSchema }).strict(),
    result: tagChangeSchema
  },
  [ServiceMethod.TagsMerge]: {
    params: z.object({ fromId: tagId, intoId: tagId }).strict(),
    result: tagChangeSchema
  },
  [ServiceMethod.TagsDelete]: {
    params: z.object({ id: tagId }).strict(),
    result: z.object({ deleted: z.boolean() })
  },
  [ServiceMethod.TagsApply]: {
    params: z.object({ tagIds, imageIds: markIds }).strict(),
    result: z.object({ changed: z.number().int().nonnegative() })
  },
  [ServiceMethod.TagsRemove]: {
    params: z.object({ tagIds, imageIds: markIds }).strict(),
    result: z.object({ changed: z.number().int().nonnegative() })
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
  },
  [ServiceMethod.ImageGeneration]: {
    params: imageIdParams,
    /** null when the image is unknown or carries no generation data. */
    result: generationDetailsSchema.nullable()
  },
  [ServiceMethod.ImageGenerationText]: {
    params: z
      .object({ imageId: z.number().int().positive(), variant: z.enum(CopyVariant) })
      .strict(),
    /** null when there is no such text (no generation, or an empty prompt). */
    result: z.string().nullable()
  }
} as const satisfies { [M in ServiceMethod]: { params: z.ZodType; result: z.ZodType } }

export type ServiceParams = { [M in ServiceMethod]: z.infer<(typeof serviceContract)[M]['params']> }
export type ServiceResults = {
  [M in ServiceMethod]: z.infer<(typeof serviceContract)[M]['result']>
}
