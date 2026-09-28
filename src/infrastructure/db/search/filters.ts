import { matchExpression, parseKeywords } from '@domain/keyword-query'
import { SetMatchMode } from '@shared/search-kinds'
import type { SearchFilters } from '@shared/search'
import type { CriteriaFilter, SqlCondition } from './criteria-filter'

// Lists bind as one JSON parameter read with json_each, so a statement's text never depends
// on how many values were chosen.
const list = (values: readonly unknown[]): string => JSON.stringify(values)
const IN_LIST = 'IN (SELECT value FROM json_each(?))'

export class CheckpointFilter implements CriteriaFilter {
  condition({ checkpointIds }: SearchFilters): SqlCondition | undefined {
    if (!checkpointIds) return undefined
    return {
      sql: `id IN (SELECT image_id FROM generations
        WHERE checkpoint_id ${IN_LIST} OR refiner_id ${IN_LIST})`,
      params: [list(checkpointIds), list(checkpointIds)]
    }
  }
}

/**
 * Any: at least one of the LoRAs; All: every one. A weight bound applies to the matching
 * links and excludes unknown (NULL) weights; with no bound, unknown weights match.
 */
export class LoraFilter implements CriteriaFilter {
  condition({ loras }: SearchFilters): SqlCondition | undefined {
    if (!loras) return undefined
    const distinct = [...new Set(loras.ids)]
    const links = `SELECT image_id FROM generation_loras
      WHERE model_id ${IN_LIST}
        AND (? IS NULL OR weight >= ?)
        AND (? IS NULL OR weight <= ?)`
    const min = loras.minWeight ?? null
    const max = loras.maxWeight ?? null
    const params = [list(distinct), min, min, max, max]
    return loras.mode === SetMatchMode.Any
      ? { sql: `id IN (${links})`, params }
      : {
          sql: `id IN (${links} GROUP BY image_id HAVING COUNT(DISTINCT model_id) = ?)`,
          params: [...params, distinct.length]
        }
  }
}

const FTS_ROWS = 'SELECT rowid FROM prompt_fts WHERE prompt_fts MATCH ?'

/** Every included term, and none of the excluded ones, in the chosen prompt columns. */
export class KeywordFilter implements CriteriaFilter {
  condition({ keywords }: SearchFilters): SqlCondition | undefined {
    if (!keywords) return undefined
    const query = parseKeywords(keywords.query)
    const include = matchExpression(query.include, keywords.scope, SetMatchMode.All)
    const exclude = matchExpression(query.exclude, keywords.scope, SetMatchMode.Any)
    const parts: SqlCondition[] = []
    if (include) parts.push({ sql: `id IN (${FTS_ROWS})`, params: [include] })
    if (exclude) parts.push({ sql: `id NOT IN (${FTS_ROWS})`, params: [exclude] })
    if (parts.length === 0) return undefined
    return {
      sql: parts.map((part) => part.sql).join(' AND '),
      params: parts.flatMap((part) => part.params)
    }
  }
}

export class GeneratorFilter implements CriteriaFilter {
  condition({ generators }: SearchFilters): SqlCondition | undefined {
    if (!generators) return undefined
    return {
      sql: `id IN (SELECT image_id FROM generations WHERE generator ${IN_LIST})`,
      params: [list(generators)]
    }
  }
}

export class SeedFilter implements CriteriaFilter {
  condition({ seed }: SearchFilters): SqlCondition | undefined {
    if (seed === undefined) return undefined
    return { sql: 'id IN (SELECT image_id FROM generations WHERE seed = ?)', params: [seed] }
  }
}

/** Images with exactly the same prompt as the given one (none when it has no prompt). */
export class SamePromptFilter implements CriteriaFilter {
  condition({ samePromptAs }: SearchFilters): SqlCondition | undefined {
    if (samePromptAs === undefined) return undefined
    return {
      sql: `id IN (SELECT image_id FROM generations
        WHERE prompt = (SELECT prompt FROM generations WHERE image_id = ?))`,
      params: [samePromptAs]
    }
  }
}

export class HasMetadataFilter implements CriteriaFilter {
  condition({ hasMetadata }: SearchFilters): SqlCondition | undefined {
    if (hasMetadata === undefined) return undefined
    return {
      sql: `id ${hasMetadata ? 'IN' : 'NOT IN'} (SELECT image_id FROM generations)`,
      params: []
    }
  }
}

/** Any: at least one of the tags; All: every one; excluded tags must all be absent. */
export class TagFilter implements CriteriaFilter {
  condition({ tags }: SearchFilters): SqlCondition | undefined {
    if (!tags) return undefined
    const parts: SqlCondition[] = []
    if (tags.ids) {
      const distinct = [...new Set(tags.ids)]
      const links = `SELECT image_id FROM image_tags WHERE tag_id ${IN_LIST}`
      parts.push(
        tags.mode === SetMatchMode.Any
          ? { sql: `id IN (${links})`, params: [list(distinct)] }
          : {
              sql: `id IN (${links} GROUP BY image_id HAVING COUNT(*) = ?)`,
              params: [list(distinct), distinct.length]
            }
      )
    }
    if (tags.excludeIds) {
      parts.push({
        sql: `id NOT IN (SELECT image_id FROM image_tags WHERE tag_id ${IN_LIST})`,
        params: [list(tags.excludeIds)]
      })
    }
    return {
      sql: parts.map((part) => part.sql).join(' AND '),
      params: parts.flatMap((part) => part.params)
    }
  }
}

export class FavoriteFilter implements CriteriaFilter {
  condition({ favoritesOnly }: SearchFilters): SqlCondition | undefined {
    return favoritesOnly ? { sql: 'is_favorite = 1', params: [] } : undefined
  }
}

export class MinRatingFilter implements CriteriaFilter {
  condition({ minRating }: SearchFilters): SqlCondition | undefined {
    return minRating === undefined ? undefined : { sql: 'rating >= ?', params: [minRating] }
  }
}

/** Every filter the gallery applies, in the order their conditions are written. */
export function createSearchFilters(): CriteriaFilter[] {
  return [
    new CheckpointFilter(),
    new LoraFilter(),
    new KeywordFilter(),
    new GeneratorFilter(),
    new SeedFilter(),
    new SamePromptFilter(),
    new HasMetadataFilter(),
    new TagFilter(),
    new FavoriteFilter(),
    new MinRatingFilter()
  ]
}
