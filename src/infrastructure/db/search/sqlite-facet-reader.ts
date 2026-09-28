import type Database from 'better-sqlite3'
import type { GalleryQuery } from '@shared/gallery'
import type { GeneratorKind } from '@shared/generation-kinds'
import { SetMatchMode } from '@shared/search-kinds'
import type { FacetValue, SearchFacets, SearchFilters } from '@shared/search'
import type { CriteriaFilter } from './criteria-filter'
import { selectImages, type ImageSelection } from './image-selection'

/**
 * For the tags facet: Any is a union, so its included tags are dropped and every tag shows
 * what it would add; All narrows and is kept. Excluded tags always apply.
 */
function withoutTagIncludes(query: GalleryQuery): GalleryQuery {
  const tags = query.filters?.tags
  if (!tags || tags.mode === SetMatchMode.All) return query
  if (!tags.excludeIds) return without(query, 'tags')
  return {
    ...query,
    filters: { ...query.filters, tags: { mode: tags.mode, excludeIds: tags.excludeIds } }
  }
}

const hasFilters = (query: GalleryQuery): boolean =>
  query.filters !== undefined && Object.keys(query.filters).length > 0

/** The query's filters without one of them, so that facet counts what else could be picked. */
function without(query: GalleryQuery, key: keyof SearchFilters): GalleryQuery {
  if (!query.filters) return query
  const filters: SearchFilters = { ...query.filters }
  delete filters[key]
  return { ...query, filters }
}

/**
 * The images a facet counts over: the whole library, or a numbered set evaluated once into
 * `temp.facet_selection`, so facets sharing a selection don't re-run its filters (keyword
 * matching above all).
 */
type Counted = { readonly all: true } | { readonly all: false; readonly selection: number }

/**
 * Joins `alias.column` to the counted images; nothing for the whole library. The selection
 * number is an internal counter, never input, so it is written into the SQL text.
 */
function restrict(counted: Counted, alias: string, column: string): string {
  return counted.all
    ? ''
    : `JOIN temp.facet_selection s ON s.id = ${alias}.${column} AND s.selection = ${counted.selection}`
}

/** Facet counts for the filter pickers, over the same scope and filters as the gallery. */
export class SqliteFacetReader {
  private readonly statements = new Map<string, Database.Statement<unknown[], unknown>>()
  private readonly clearSelections: Database.Statement

  constructor(
    private readonly db: Database.Database,
    private readonly filters: readonly CriteriaFilter[]
  ) {
    db.exec(`CREATE TEMP TABLE IF NOT EXISTS facet_selection (
      selection INTEGER NOT NULL,
      id INTEGER NOT NULL,
      PRIMARY KEY (selection, id)
    ) WITHOUT ROWID`)
    this.clearSelections = db.prepare('DELETE FROM temp.facet_selection')
  }

  facets(query: GalleryQuery): SearchFacets {
    return this.db.transaction(() => {
      this.clearSelections.run()
      const counted = new Map<string, Counted>()
      const count = (scope: GalleryQuery): Counted => this.counted(scope, counted)
      const loras = query.filters?.loras
      return {
        checkpoints: this.checkpoints(count(without(query, 'checkpointIds'))),
        // Any is a union, so its selection is dropped and every LoRA shows what it would add.
        // All narrows, so its selection is kept and each count is what adding it would leave.
        loras: this.loras(
          count(loras?.mode === SetMatchMode.All ? query : without(query, 'loras')),
          loras?.minWeight ?? null,
          loras?.maxWeight ?? null
        ),
        tags: this.tags(count(withoutTagIncludes(query))),
        generators: this.generators(count(without(query, 'generators'))),
        withoutMetadata: this.withoutMetadata(count(without(query, 'hasMetadata')))
      }
    })()
  }

  /**
   * Evaluates a selection once per facets() call. The whole library isn't materialized, nor
   * is a folder scope without filters that holds every image (a library's only root), which
   * is the view opened most; checking that is a cheap count on the directory index.
   */
  private counted(scope: GalleryQuery, cache: Map<string, Counted>): Counted {
    const selection = selectImages(scope, this.filters)
    if (!selection.prefix && !selection.where) return { all: true }
    if (!hasFilters(scope) && this.coversEveryImage(selection)) return { all: true }
    const key = `${selection.prefix}${selection.where}\0${JSON.stringify(selection.params)}`
    const cached = cache.get(key)
    if (cached) return cached
    const counted: Counted = { all: false, selection: cache.size }
    this.run(
      `${selection.prefix}
       INSERT INTO temp.facet_selection (selection, id)
       SELECT ${counted.selection}, id FROM images ${selection.where}`,
      selection.params
    )
    cache.set(key, counted)
    return counted
  }

  /**
   * Checkpoints counted as model or refiner. A refiner that is also the image's checkpoint is
   * left out of the second half, so each image counts once per model without DISTINCT.
   */
  private checkpoints(counted: Counted): FacetValue[] {
    return this.all<FacetValue>(
      `SELECT models.id, models.display_name AS name, COUNT(*) AS count
       FROM (
         SELECT g.image_id, g.checkpoint_id AS model_id FROM generations g
         ${restrict(counted, 'g', 'image_id')} WHERE g.checkpoint_id IS NOT NULL
         UNION ALL
         SELECT g.image_id, g.refiner_id FROM generations g
         ${restrict(counted, 'g', 'image_id')}
         WHERE g.refiner_id IS NOT NULL AND g.refiner_id IS NOT g.checkpoint_id
       ) used JOIN models ON models.id = used.model_id
       GROUP BY models.id
       ORDER BY count DESC, name COLLATE NOCASE, models.id`,
      []
    )
  }

  /**
   * Weight bounds apply to the counted links, as they do to the gallery's matching links.
   * A link is unique per (image, LoRA), so counting links counts images.
   */
  private loras(counted: Counted, min: number | null, max: number | null): FacetValue[] {
    return this.all<FacetValue>(
      // Grouped by model id first, so names are looked up once per LoRA, not once per link.
      `SELECT models.id, models.display_name AS name, used.count
       FROM (
         SELECT links.model_id, COUNT(*) AS count
         FROM generation_loras links ${restrict(counted, 'links', 'image_id')}
         WHERE (? IS NULL OR links.weight >= ?) AND (? IS NULL OR links.weight <= ?)
         GROUP BY links.model_id
       ) used JOIN models ON models.id = used.model_id
       ORDER BY used.count DESC, name COLLATE NOCASE, models.id`,
      [min, min, max, max]
    )
  }

  /** A tag link is unique per (image, tag), so counting links counts images. */
  private tags(counted: Counted): FacetValue[] {
    return this.all<FacetValue>(
      `SELECT tags.id, tags.name, used.count
       FROM (
         SELECT links.tag_id, COUNT(*) AS count
         FROM image_tags links ${restrict(counted, 'links', 'image_id')}
         GROUP BY links.tag_id
       ) used JOIN tags ON tags.id = used.tag_id
       ORDER BY used.count DESC, tags.name_key, tags.id`,
      []
    )
  }

  private generators(counted: Counted): { kind: GeneratorKind; count: number }[] {
    return this.all<{ kind: GeneratorKind; count: number }>(
      `SELECT g.generator AS kind, COUNT(*) AS count FROM generations g
       ${restrict(counted, 'g', 'image_id')}
       GROUP BY g.generator ORDER BY count DESC, g.generator`,
      []
    )
  }

  private withoutMetadata(counted: Counted): number {
    const [row] = this.all<{ count: number }>(
      `SELECT COUNT(*) AS count FROM images i ${restrict(counted, 'i', 'id')}
       WHERE i.id NOT IN (SELECT image_id FROM generations)`,
      []
    )
    return row?.count ?? 0
  }

  private coversEveryImage(selection: ImageSelection): boolean {
    const [row] = this.all<{ every: number }>(
      `${selection.prefix}
       SELECT (SELECT COUNT(*) FROM images ${selection.where}) = (SELECT COUNT(*) FROM images)
         AS every`,
      selection.params
    )
    return row?.every === 1
  }

  private all<T>(sql: string, params: readonly unknown[]): T[] {
    return this.statement(sql).all(...params) as T[]
  }

  private run(sql: string, params: readonly unknown[]): void {
    this.statement(sql).run(...params)
  }

  /** Statements are cached by text, which depends only on the filters in use. */
  private statement(sql: string): Database.Statement<unknown[], unknown> {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.db.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement
  }
}
