import { z } from 'zod'
import { ImageFormat } from './image-format'
import { searchFiltersSchema } from './search'
import { GalleryScopeKind, LAYOUT_STRIDE, SortOrder } from './gallery-kinds'

export { GalleryScopeKind, LAYOUT_STRIDE, MAX_IMAGES_PER_REQUEST, SortOrder } from './gallery-kinds'

const id = z.number().int().positive()

export const galleryQuerySchema = z
  .object({
    scope: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal(GalleryScopeKind.All) }).strict(),
      z
        .object({
          kind: z.literal(GalleryScopeKind.Directory),
          directoryId: id,
          /** Include images in every folder below this one. */
          recursive: z.boolean()
        })
        .strict()
    ]),
    sort: z.enum(SortOrder),
    filters: searchFiltersSchema.optional()
  })
  .strict()

export type GalleryQuery = z.infer<typeof galleryQuerySchema>

/**
 * The whole result set in display order as `[id, width, height, id, width, height, …]`:
 * enough for the masonry grid to size every card before any image loads.
 */
export const imageLayoutSchema = z
  .instanceof(Int32Array)
  .refine((layout) => layout.length % LAYOUT_STRIDE === 0, 'length must be a multiple of 3')

export const imageCardSchema = z
  .object({
    id,
    rootId: id,
    directoryId: id,
    fileName: z.string(),
    /** POSIX path of the folder relative to its root, `''` for the root itself. */
    relDir: z.string(),
    format: z.enum(ImageFormat),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sizeBytes: z.number().int().nonnegative(),
    createdAt: z.number(),
    addedAt: z.number()
  })
  .readonly()

export type ImageCard = z.infer<typeof imageCardSchema>

export interface DirectoryNode {
  readonly id: number
  /** Last path segment; `''` for the root folder. */
  readonly name: string
  readonly relPath: string
  /** Images directly in this folder. */
  readonly imageCount: number
  /** Images in this folder and every folder below it. */
  readonly totalImageCount: number
  readonly children: readonly DirectoryNode[]
}

export const directoryNodeSchema: z.ZodType<DirectoryNode> = z.lazy(() =>
  z
    .object({
      id,
      name: z.string(),
      relPath: z.string(),
      imageCount: z.number().int().nonnegative(),
      totalImageCount: z.number().int().nonnegative(),
      children: z.array(directoryNodeSchema).readonly()
    })
    .readonly()
)
