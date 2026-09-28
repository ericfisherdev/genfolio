import type Database from 'better-sqlite3'
import type { GalleryQuery } from '@shared/gallery'
import type { GeneratorKind } from '@shared/generation-kinds'
import { SetMatchMode } from '@shared/search-kinds'
import type { FacetValue, SearchFacets, SearchFilters } from '@shared/search'
import type { ImageSelection, ImageSelector } from './image-selection'

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
 * The images a facet counts over: the whole library; a numbered set evaluated once into
 * `temp.facet_selection`, so facets sharing a selection don't re-run its filters (keyword
 * matching above all); or, when a selection holds most of the library, the whole library
 * minus a numbered set of the images it leaves out, which is far cheaper to count over.
 */
type Counted =
  | { readonly kind: 'all' }
  | { readonly kind: 'selection'; readonly selection: number }
  | { readonly kind: 'all-but'; readonly excluded: number }

/**
 * Joins `alias.column` to the numbered set, or nothing for the whole library. The number is
 * an internal counter, never input, so it is written into the SQL text.
 */
function restrict(selection: number | undefined, alias: string, column: string): string {
  return selection === undefined
    ? ''
    : `JOIN temp.facet_selection s ON s.id = ${alias}.${column} AND s.selection = ${selection}`
}

interface Sql {
  readonly sql: string
  readonly params: readonly unknown[]
}

/**
 * A facet's `SELECT key, n … GROUP BY key` over some images, given the join that restricts
 * its rows to them (empty for the whole library).
 */
type Grouped = (restriction: (alias: string, column: string) => string) => Sql

const over =
  (selection: number | undefined) =>
  (alias: string, column: string): string =>
    restrict(selection, alias, column)

/**
 * The `(key, n)` rows a facet shows over the counted images: counted directly, or as library
 * totals minus the left-out images' counts. Keys left with no images are dropped.
 */
function countsOver(counted: Counted, grouped: Grouped): Sql {
  switch (counted.kind) {
    case 'all':
      return grouped(over(undefined))
    case 'selection':
      return grouped(over(counted.selection))
    case 'all-but': {
      const totals = grouped(over(undefined))
      const excluded = grouped(over(counted.excluded))
      return {
        sql: `SELECT key, SUM(n) AS n FROM (
            ${totals.sql}
            UNION ALL
            SELECT key, -n FROM (${excluded.sql})
          ) GROUP BY key HAVING SUM(n) > 0`,
        params: [...totals.params, ...excluded.params]
      }
    }
  }
}

/** Past this share of the library, facets count the library minus what a selection leaves out. */
const COMPLEMENT_ABOVE = 0.7

/** Facet counts for the filter pickers, over the same scope and filters as the gallery. */
export class SqliteFacetReader {
  private readonly statements = new Map<string, Database.Statement<unknown[], unknown>>()
  private readonly clearSelections: Database.Statement

  constructor(
    private readonly db: Database.Database,
    private readonly selector: ImageSelector,
    /** Share of the library past which counting goes by the left-out images; for tests. */
    private readonly complementAbove = COMPLEMENT_ABOVE
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
    const selection = this.selector.select(scope)
    if (!selection.prefix && !selection.where) return { kind: 'all' }
    if (!hasFilters(scope) && this.coversEveryImage(selection)) return { kind: 'all' }
    const key = `${selection.prefix}${selection.where}\0${JSON.stringify(selection.params)}`
    const cached = cache.get(key)
    if (cached) return cached
    // Two numbers per selection: the selection itself, and the images it leaves out.
    const number = cache.size * 2
    const selected = this.run(
      `${selection.prefix}
       INSERT INTO temp.facet_selection (selection, id)
       SELECT ${number}, id FROM images ${selection.where}`,
      selection.params
    )
    const counted: Counted =
      selected > this.librarySize() * this.complementAbove
        ? { kind: 'all-but', excluded: this.leftOut(number, number + 1) }
        : { kind: 'selection', selection: number }
    cache.set(key, counted)
    return counted
  }

  /** Numbers the images selection `from` leaves out as `into`; returns `into`. */
  private leftOut(from: number, into: number): number {
    this.run(
      `INSERT INTO temp.facet_selection (selection, id)
       SELECT ${into}, id FROM images
       WHERE id NOT IN (SELECT id FROM temp.facet_selection WHERE selection = ${from})`,
      []
    )
    return into
  }

  private librarySize(): number {
    const [row] = this.all<{ count: number }>('SELECT COUNT(*) AS count FROM images', [])
    return row?.count ?? 0
  }

  /**
   * Checkpoints counted as model or refiner. A refiner that is also the image's checkpoint is
   * left out of the second half, so each image counts once per model without DISTINCT.
   */
  private checkpoints(counted: Counted): FacetValue[] {
    const used = countsOver(counted, (restricted) => ({
      sql: `SELECT model_id AS key, COUNT(*) AS n FROM (
          SELECT g.checkpoint_id AS model_id FROM generations g
          ${restricted('g', 'image_id')} WHERE g.checkpoint_id IS NOT NULL
          UNION ALL
          SELECT g.refiner_id FROM generations g ${restricted('g', 'image_id')}
          WHERE g.refiner_id IS NOT NULL AND g.refiner_id IS NOT g.checkpoint_id
        ) GROUP BY model_id`,
      params: []
    }))
    return this.all<FacetValue>(
      `SELECT models.id, models.display_name AS name, used.n AS count
       FROM (${used.sql}) used JOIN models ON models.id = used.key
       ORDER BY count DESC, name COLLATE NOCASE, models.id`,
      used.params
    )
  }

  /**
   * Weight bounds apply to the counted links, as they do to the gallery's matching links.
   * A link is unique per (image, LoRA), so counting links counts images. Grouped by model id
   * first, so names are looked up once per LoRA, not once per link.
   */
  private loras(counted: Counted, min: number | null, max: number | null): FacetValue[] {
    const used = countsOver(counted, (restricted) => ({
      sql: `SELECT links.model_id AS key, COUNT(*) AS n
        FROM generation_loras links ${restricted('links', 'image_id')}
        WHERE (? IS NULL OR links.weight >= ?) AND (? IS NULL OR links.weight <= ?)
        GROUP BY links.model_id`,
      params: [min, min, max, max]
    }))
    return this.all<FacetValue>(
      `SELECT models.id, models.display_name AS name, used.n AS count
       FROM (${used.sql}) used JOIN models ON models.id = used.key
       ORDER BY count DESC, name COLLATE NOCASE, models.id`,
      used.params
    )
  }

  /** A tag link is unique per (image, tag), so counting links counts images. */
  private tags(counted: Counted): FacetValue[] {
    const used = countsOver(counted, (restricted) => ({
      sql: `SELECT links.tag_id AS key, COUNT(*) AS n
        FROM image_tags links ${restricted('links', 'image_id')}
        GROUP BY links.tag_id`,
      params: []
    }))
    return this.all<FacetValue>(
      `SELECT tags.id, tags.name, used.n AS count
       FROM (${used.sql}) used JOIN tags ON tags.id = used.key
       ORDER BY count DESC, tags.name_key, tags.id`,
      used.params
    )
  }

  private generators(counted: Counted): { kind: GeneratorKind; count: number }[] {
    const used = countsOver(counted, (restricted) => ({
      sql: `SELECT g.generator AS key, COUNT(*) AS n
        FROM generations g ${restricted('g', 'image_id')} GROUP BY g.generator`,
      params: []
    }))
    return this.all<{ kind: GeneratorKind; count: number }>(
      `SELECT key AS kind, n AS count FROM (${used.sql}) ORDER BY count DESC, kind`,
      used.params
    )
  }

  private withoutMetadata(counted: Counted): number {
    // One constant key, so the library-minus-left-out form works here too.
    const used = countsOver(counted, (restricted) => ({
      sql: `SELECT 0 AS key, COUNT(*) AS n FROM images i ${restricted('i', 'id')}
        WHERE i.id NOT IN (SELECT image_id FROM generations)`,
      params: []
    }))
    const [row] = this.all<{ count: number }>(`SELECT n AS count FROM (${used.sql})`, used.params)
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

  /** Returns how many rows changed. */
  private run(sql: string, params: readonly unknown[]): number {
    return this.statement(sql).run(...params).changes
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
