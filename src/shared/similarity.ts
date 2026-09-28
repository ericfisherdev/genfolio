import { z } from 'zod'
import { MAX_SIMILARITY_DISTANCE } from './similarity-kinds'

export {
  DEFAULT_SIMILARITY_THRESHOLD,
  MAX_SIMILARITY_DISTANCE,
  NEAR_IDENTICAL_DISTANCE
} from './similarity-kinds'

const id = z.number().int().positive()

export const similarityThresholdSchema = z.number().int().min(0).max(MAX_SIMILARITY_DISTANCE)

/** A look-alike group: its size and its first members, the suggested keeper first. */
export const similarGroupSchema = z
  .object({
    groupId: id,
    count: z.number().int().min(2),
    imageIds: z.array(id).readonly()
  })
  .strict()

export type SimilarGroup = z.infer<typeof similarGroupSchema>

export const similarGroupsPageSchema = z
  .object({ total: z.number().int().nonnegative(), groups: z.array(similarGroupSchema).readonly() })
  .strict()

export type SimilarGroupsPage = z.infer<typeof similarGroupsPageSchema>

/** Groups per page of the groups view, and members shown per group. */
export const MAX_GROUPS_PER_PAGE = 100
export const GROUP_PREVIEW_SIZE = 6
