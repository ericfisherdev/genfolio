import type Database from 'better-sqlite3'
import type { ModelStatsReader, OverviewRequest } from '@domain/model-stats-reader'
import { ModelKind } from '@shared/generation-kinds'
import type {
  ModelPair,
  ModelStat,
  ModelStatRef,
  ModelStatsOverview,
  ModelUsage
} from '@shared/model-stats'
import type { ModelTagRef } from '@shared/model-tags'
import type { ModelKey } from '@shared/models'
import { modelTagsJson } from './repositories/model-tags-sql'

// Every query counts images, never links: a LoRA link is unique per (image, LoRA), and a
// checkpoint is counted once per image even when it is both the model and the refiner. That
// is what the gallery's checkpoint and LoRA filters match, so a row's count equals the size
// of the gallery its filters open.

/** Models carrying the tag, by `models.id`, resolved through (kind, identity). */
const TAGGED_MODELS = `WITH tagged(id) AS MATERIALIZED (
  SELECT m.id FROM models m
  JOIN model_tag_links l ON l.kind = m.kind AND l.identity = m.identity
  WHERE l.tag_id = @tag)`

const IN_TAGGED = 'IN (SELECT id FROM tagged)'

/** How a query narrows the models it counts. */
interface Narrowing {
  readonly tagged: boolean
  /** Leads each subquery that counts; empty when every model counts. */
  readonly prefix: string
  /** Conditions limiting `column` to the counted models. */
  readonly condition: (column: string) => string[]
  readonly params: Record<string, number>
}

const EVERY_MODEL: Narrowing = { tagged: false, prefix: '', condition: () => [], params: {} }

const taggedWith = (tag: number): Narrowing => ({
  tagged: true,
  prefix: TAGGED_MODELS,
  condition: (column) => [`${column} ${IN_TAGGED}`],
  params: { tag }
})

const whereAll = (conditions: string[]): string =>
  conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

interface UseSelection {
  /** The columns one use of a checkpoint yields, given the column holding its id. */
  readonly select: (model: string) => string
  /** Always joins `generations g`. */
  readonly from: string
  /** Conditions on the checkpoint's column, and on anything else in `from`. */
  readonly where: (model: string) => string[]
}

/**
 * One row per image per checkpoint it uses as model or refiner: the refiner is left out
 * when it is also the image's checkpoint, so no DISTINCT is needed.
 */
function checkpointUses({ select, from, where }: UseSelection): string {
  const half = (model: string, own: string[]): string =>
    `SELECT ${select(model)} FROM ${from}
     ${whereAll([`${model} IS NOT NULL`, ...own, ...where(model)])}`
  return `${half('g.checkpoint_id', [])}
     UNION ALL
     ${half('g.refiner_id', ['g.refiner_id IS NOT g.checkpoint_id'])}`
}

const CHECKPOINT_LORA_FROM = 'generations g JOIN generation_loras l ON l.image_id = g.image_id'

/** `model_id, n` for each checkpoint over its uses. */
const checkpointCounts = (narrowing: Narrowing): string => `
  ${narrowing.prefix}
  SELECT model_id, COUNT(*) AS n FROM (${checkpointUses({
    select: (model) => `${model} AS model_id`,
    from: 'generations g',
    where: narrowing.condition
  })}) GROUP BY model_id`

/** `model_id, n` for each LoRA over its links. */
const loraCounts = (narrowing: Narrowing): string => `
  ${narrowing.prefix}
  SELECT model_id, COUNT(*) AS n FROM generation_loras
  ${whereAll(narrowing.condition('model_id'))} GROUP BY model_id`

const REF_COLUMNS = 'm.id, m.kind, m.identity, m.display_name AS name'

/** Models ranked by count, then name, as the facets rank them; the limit is applied here. */
const ranked = (counts: string): string => `
  SELECT ${REF_COLUMNS}, used.n AS image_count FROM (${counts}) used
  JOIN models m ON m.id = used.model_id
  ORDER BY used.n DESC, m.display_name COLLATE NOCASE, m.id LIMIT @limit`

/** Adds each ranked model's tags, looked up once the limit has cut the list. */
const withTags = (rankedModels: string): string => `
  SELECT e.*, ${modelTagsJson('e')} AS tags_json FROM (${rankedModels}) e
  ORDER BY e.image_count DESC, e.name COLLATE NOCASE, e.id`

const PAIR_COLUMNS = `
  pairs.n AS image_count,
  a.id AS first_id, a.kind AS first_kind, a.identity AS first_identity, a.display_name AS first_name,
  b.id AS second_id, b.kind AS second_kind, b.identity AS second_identity, b.display_name AS second_name`

/**
 * Pairs ranked by count, then id, cut to the limit before the names are joined. `pairs` must
 * give `first_id, second_id, n`.
 */
const rankedPairs = (pairs: string): string => `
  SELECT ${PAIR_COLUMNS} FROM (
    SELECT first_id, second_id, n FROM (${pairs})
    ORDER BY n DESC, first_id, second_id LIMIT @limit) pairs
  JOIN models a ON a.id = pairs.first_id
  JOIN models b ON b.id = pairs.second_id
  ORDER BY pairs.n DESC, pairs.first_id, pairs.second_id`

/**
 * Checkpoint-with-LoRA counts. When narrowed, the pairs with a tagged side lead from the
 * tagged LoRAs, then from the tagged checkpoints with an untagged LoRA: each pair is counted
 * once, and the scan starts from the few tagged models.
 */
function checkpointLoraPairs(narrowing: Narrowing): string {
  const uses = (where: (model: string) => string[]): string =>
    checkpointUses({
      select: (model) => `${model} AS first_id, l.model_id AS second_id`,
      from: CHECKPOINT_LORA_FROM,
      where
    })
  const sides = narrowing.tagged
    ? `${uses(() => narrowing.condition('l.model_id'))}
       UNION ALL
       ${uses((model) => [...narrowing.condition(model), `l.model_id NOT ${IN_TAGGED}`])}`
    : uses(() => [])
  return `${narrowing.prefix}
    SELECT first_id, second_id, COUNT(*) AS n FROM (${sides}) GROUP BY first_id, second_id`
}

/**
 * LoRA pairs are grouped by one integer holding both ids, `first * RADIX + second`: grouping
 * on a single key is far faster than on two columns over the hundreds of thousands of pairs
 * a library holds, and decoding afterwards costs little.
 */
const PAIR_KEY_RADIX = 2 ** 32

const decodePairs = (keyed: string): string => `
  SELECT k / ${PAIR_KEY_RADIX} AS first_id, k % ${PAIR_KEY_RADIX} AS second_id, n FROM (${keyed})`

/** LoRA-with-LoRA counts, the lower id first. Narrowed pairs lead from the tagged side. */
function loraPairs(narrowing: Narrowing): string {
  if (!narrowing.tagged) {
    return decodePairs(`SELECT a.model_id * ${PAIR_KEY_RADIX} + b.model_id AS k, COUNT(*) AS n
      FROM generation_loras a
      JOIN generation_loras b ON b.image_id = a.image_id AND b.model_id > a.model_id
      GROUP BY k`)
  }
  // From a tagged LoRA t to a partner p; a pair of two tagged LoRAs is reached from its lower id.
  return decodePairs(`${narrowing.prefix}
    SELECT MIN(t.model_id, p.model_id) * ${PAIR_KEY_RADIX} + MAX(t.model_id, p.model_id) AS k,
      COUNT(*) AS n
    FROM generation_loras t
    JOIN generation_loras p ON p.image_id = t.image_id AND p.model_id <> t.model_id
    WHERE t.model_id ${IN_TAGGED} AND (p.model_id NOT ${IN_TAGGED} OR p.model_id > t.model_id)
    GROUP BY k`)
}

// A model's own usage; `m` is its `models` row, `@subject` its id.
const CHECKPOINT_IMAGES = `SELECT COUNT(*) FROM (${checkpointUses({
  select: () => 'g.image_id',
  from: 'generations g',
  where: (model) => [`${model} = m.id`]
})})`
const LORA_IMAGES = 'SELECT COUNT(*) FROM generation_loras WHERE model_id = m.id'

const LORAS_WITH_LORA = `SELECT p.model_id AS model_id, COUNT(*) AS n
  FROM generation_loras s
  JOIN generation_loras p ON p.image_id = s.image_id AND p.model_id <> s.model_id
  WHERE s.model_id = @subject GROUP BY p.model_id`

const CHECKPOINTS_OF_LORA = `SELECT model_id, COUNT(*) AS n FROM (${checkpointUses({
  select: (model) => `${model} AS model_id`,
  from: CHECKPOINT_LORA_FROM,
  where: () => ['l.model_id = @subject']
})}) GROUP BY model_id`

const LORAS_OF_CHECKPOINT = `SELECT model_id, COUNT(*) AS n FROM (${checkpointUses({
  select: () => 'l.model_id AS model_id',
  from: CHECKPOINT_LORA_FROM,
  where: (model) => [`${model} = @subject`]
})}) GROUP BY model_id`

interface StatRow extends RefRow {
  image_count: number
  tags_json: string
}

interface RefRow {
  id: number
  kind: ModelKind
  identity: string
  name: string
}

interface PairRow {
  image_count: number
  first_id: number
  first_kind: ModelKind
  first_identity: string
  first_name: string
  second_id: number
  second_kind: ModelKind
  second_identity: string
  second_name: string
}

const ref = ({ id, kind, identity, name }: RefRow): ModelStatRef => ({ id, kind, identity, name })

const stat = (row: StatRow): ModelStat => ({
  ...ref(row),
  imageCount: row.image_count,
  tags: JSON.parse(row.tags_json) as ModelTagRef[]
})

const pair = (row: PairRow): ModelPair => ({
  first: ref({
    id: row.first_id,
    kind: row.first_kind,
    identity: row.first_identity,
    name: row.first_name
  }),
  second: ref({
    id: row.second_id,
    kind: row.second_kind,
    identity: row.second_identity,
    name: row.second_name
  }),
  imageCount: row.image_count
})

/** Pairs a subject with each partner, the subject first or second as the pair's order needs. */
const orient = (subject: ModelStatRef, partner: ModelStatRef, imageCount: number): ModelPair => {
  const subjectFirst =
    subject.kind === ModelKind.Checkpoint ||
    (partner.kind === ModelKind.Lora && subject.id < partner.id)
  return subjectFirst
    ? { first: subject, second: partner, imageCount }
    : { first: partner, second: subject, imageCount }
}

/**
 * The models' usage statistics, read over the whole library. One request reads inside a
 * single transaction, and every list is cut to its limit before names and tags are looked up.
 */
export class SqliteModelStatsReader implements ModelStatsReader {
  private readonly statements = new Map<string, Database.Statement<[object], unknown>>()

  constructor(private readonly db: Database.Database) {}

  overview({ modelTagId, limit }: OverviewRequest): ModelStatsOverview {
    const narrowing = modelTagId === null ? EVERY_MODEL : taggedWith(modelTagId)
    const params = { ...narrowing.params, limit }
    return this.db.transaction(() => ({
      checkpoints: this.all<StatRow>(withTags(ranked(checkpointCounts(narrowing))), params).map(
        stat
      ),
      loras: this.all<StatRow>(withTags(ranked(loraCounts(narrowing))), params).map(stat),
      checkpointLoraPairs: this.all<PairRow>(
        rankedPairs(checkpointLoraPairs(narrowing)),
        params
      ).map(pair),
      loraPairs: this.all<PairRow>(rankedPairs(loraPairs(narrowing)), params).map(pair)
    }))()
  }

  usage(key: ModelKey, limit: number): ModelUsage | null {
    return this.db.transaction(() => {
      const model = this.subject(key)
      if (!model) return null
      const subject = ref(model)
      const params = { subject: model.id, limit }
      const partners = (counts: string): ModelPair[] =>
        this.all<RefRow & { image_count: number }>(ranked(counts), params).map((row) =>
          orient(subject, ref(row), row.image_count)
        )
      return model.kind === ModelKind.Checkpoint
        ? { model: stat(model), loras: partners(LORAS_OF_CHECKPOINT), checkpoints: [] }
        : {
            model: stat(model),
            loras: partners(LORAS_WITH_LORA),
            checkpoints: partners(CHECKPOINTS_OF_LORA)
          }
    })()
  }

  /** The model with its image count and tags; undefined when no image uses it. */
  private subject(key: ModelKey): StatRow | undefined {
    const count = key.kind === ModelKind.Checkpoint ? CHECKPOINT_IMAGES : LORA_IMAGES
    const [row] = this.all<StatRow>(
      `SELECT ${REF_COLUMNS}, (${count}) AS image_count, ${modelTagsJson('m')} AS tags_json
       FROM models m WHERE m.kind = @kind AND m.identity = @identity`,
      key
    )
    return row && row.image_count > 0 ? row : undefined
  }

  private all<T>(sql: string, params: object): T[] {
    return this.statement(sql).all(params) as T[]
  }

  /** Statements are cached by text, which has one form per kind of request. */
  private statement(sql: string): Database.Statement<[object], unknown> {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.db.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement
  }
}
