import type Database from 'better-sqlite3'
import type { GalleryQuery } from '@shared/gallery'
import type { GeneratorKind } from '@shared/generation-kinds'
import type { FacetValue, SearchFacets, SearchFilters } from '@shared/search'
import type { CriteriaFilter } from './criteria-filter'
import { selectImages, type ImageSelection } from './image-selection'

const IN_SELECTION = (selection: ImageSelection): string =>
  `IN (SELECT id FROM images ${selection.where})`

/** The query's filters without one of them, so that facet counts what else could be picked. */
function without(query: GalleryQuery, key: keyof SearchFilters): GalleryQuery {
  if (!query.filters) return query
  const filters: SearchFilters = { ...query.filters }
  delete filters[key]
  return { ...query, filters }
}

/** Facet counts for the filter pickers, over the same scope and filters as the gallery. */
export class SqliteFacetReader {
  private readonly statements = new Map<string, Database.Statement<unknown[], unknown>>()

  constructor(
    private readonly db: Database.Database,
    private readonly filters: readonly CriteriaFilter[]
  ) {}

  facets(query: GalleryQuery): SearchFacets {
    return {
      checkpoints: this.checkpoints(without(query, 'checkpointIds')),
      loras: this.loras(without(query, 'loras')),
      generators: this.generators(without(query, 'generators')),
      withoutMetadata: this.withoutMetadata(without(query, 'hasMetadata'))
    }
  }

  private checkpoints(query: GalleryQuery): FacetValue[] {
    const selection = selectImages(query, this.filters)
    return this.all<FacetValue>(
      `${selection.prefix}
       SELECT models.id, models.display_name AS name, COUNT(DISTINCT g.image_id) AS count
       FROM generations g
       JOIN models ON models.id = g.checkpoint_id OR models.id = g.refiner_id
       WHERE g.image_id ${IN_SELECTION(selection)}
       GROUP BY models.id
       ORDER BY count DESC, name COLLATE NOCASE, models.id`,
      selection.params
    )
  }

  private loras(query: GalleryQuery): FacetValue[] {
    const selection = selectImages(query, this.filters)
    return this.all<FacetValue>(
      `${selection.prefix}
       SELECT models.id, models.display_name AS name, COUNT(DISTINCT links.image_id) AS count
       FROM generation_loras links JOIN models ON models.id = links.model_id
       WHERE links.image_id ${IN_SELECTION(selection)}
       GROUP BY models.id
       ORDER BY count DESC, name COLLATE NOCASE, models.id`,
      selection.params
    )
  }

  private generators(query: GalleryQuery): { kind: GeneratorKind; count: number }[] {
    const selection = selectImages(query, this.filters)
    return this.all<{ kind: GeneratorKind; count: number }>(
      `${selection.prefix}
       SELECT generator AS kind, COUNT(*) AS count FROM generations
       WHERE image_id ${IN_SELECTION(selection)}
       GROUP BY generator ORDER BY count DESC, generator`,
      selection.params
    )
  }

  private withoutMetadata(query: GalleryQuery): number {
    const selection = selectImages(query, this.filters)
    const [row] = this.all<{ count: number }>(
      `${selection.prefix}
       SELECT COUNT(*) AS count FROM images
       WHERE id ${IN_SELECTION(selection)} AND id NOT IN (SELECT image_id FROM generations)`,
      selection.params
    )
    return row?.count ?? 0
  }

  /** Statements are cached by text, which depends only on the filters in use. */
  private all<T>(sql: string, params: readonly unknown[]): T[] {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.db.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement.all(...params) as T[]
  }
}
