import type Database from 'better-sqlite3'
import type { StoredFilterCodec } from '@domain/albums'
import { ModelKind } from '@shared/generation-kinds'
import { nameKey } from '@shared/name-key'
import { SetMatchMode, type SearchFilters, type StoredSearchFilters } from '@shared/search'

type NamedRow = { id: number; name: string }

/** Names resolved for one kind of list, and whether every stored name was found. */
interface Resolved {
  readonly ids: number[]
  readonly complete: boolean
}

/** Smart album filters to and from their stored form, looked up in the library database. */
export class SqliteStoredFilterCodec implements StoredFilterCodec {
  private readonly modelsById: Database.Statement<[string, string], NamedRow>
  private readonly modelsByIdentity: Database.Statement<[string, string], NamedRow>
  private readonly tagsById: Database.Statement<[string], NamedRow>
  private readonly tagsByKey: Database.Statement<[string], NamedRow>
  private readonly promptOf: Database.Statement<[number], { prompt: string | null }>
  private readonly imageWithPrompt: Database.Statement<[string], { image_id: number }>

  constructor(db: Database.Database) {
    this.modelsById = db.prepare(
      'SELECT id, identity AS name FROM models WHERE kind = ? AND id IN (SELECT value FROM json_each(?))'
    )
    this.modelsByIdentity = db.prepare(
      'SELECT id, identity AS name FROM models WHERE kind = ? AND identity IN (SELECT value FROM json_each(?))'
    )
    this.tagsById = db.prepare(
      'SELECT id, name FROM tags WHERE id IN (SELECT value FROM json_each(?))'
    )
    this.tagsByKey = db.prepare(
      'SELECT id, name_key AS name FROM tags WHERE name_key IN (SELECT value FROM json_each(?))'
    )
    this.promptOf = db.prepare('SELECT prompt FROM generations WHERE image_id = ?')
    this.imageWithPrompt = db.prepare(
      'SELECT image_id FROM generations WHERE prompt = ? ORDER BY image_id LIMIT 1'
    )
  }

  store(filters: SearchFilters): StoredSearchFilters {
    const { checkpointIds, loras, tags, samePromptAs, ...plain } = filters
    const stored: StoredSearchFilters = { ...plain }
    const checkpoints = checkpointIds && this.identities(ModelKind.Checkpoint, checkpointIds)
    if (checkpoints?.length) stored.checkpoints = checkpoints
    if (loras) {
      const models = this.identities(ModelKind.Lora, loras.ids)
      if (models.length > 0) {
        stored.loras = { models, mode: loras.mode, ...weightBounds(loras) }
      }
    }
    if (tags) {
      const names = tags.ids && this.tagNames(tags.ids)
      const excludeNames = tags.excludeIds && this.tagNames(tags.excludeIds)
      if (names?.length || excludeNames?.length) {
        stored.tags = {
          mode: tags.mode,
          ...(names?.length ? { names } : {}),
          ...(excludeNames?.length ? { excludeNames } : {})
        }
      }
    }
    const prompt = samePromptAs === undefined ? null : this.promptOf.get(samePromptAs)?.prompt
    if (prompt) stored.samePrompt = prompt
    return stored
  }

  resolve(stored: StoredSearchFilters): SearchFilters | undefined {
    const { checkpoints, loras, tags, samePrompt, ...plain } = stored
    const filters: SearchFilters = { ...plain }
    if (checkpoints) {
      // Any of them: the ones still stored will do.
      const found = this.modelIds(ModelKind.Checkpoint, checkpoints)
      if (found.ids.length === 0) return undefined
      filters.checkpointIds = found.ids
    }
    if (loras) {
      const found = this.modelIds(ModelKind.Lora, loras.models)
      if (!satisfiable(found, loras.mode)) return undefined
      filters.loras = { ids: found.ids, mode: loras.mode, ...weightBounds(loras) }
    }
    if (tags) {
      const included = tags.names && this.tagIds(tags.names)
      if (included && !satisfiable(included, tags.mode)) return undefined
      const excluded = tags.excludeNames ? this.tagIds(tags.excludeNames).ids : []
      if (included || excluded.length > 0) {
        filters.tags = {
          mode: tags.mode,
          ...(included ? { ids: included.ids } : {}),
          ...(excluded.length > 0 ? { excludeIds: excluded } : {})
        }
      }
    }
    if (samePrompt !== undefined) {
      const image = this.imageWithPrompt.get(samePrompt)
      if (!image) return undefined
      filters.samePromptAs = image.image_id
    }
    return filters
  }

  private identities(kind: ModelKind, ids: readonly number[]): { identity: string }[] {
    return this.modelsById.all(kind, JSON.stringify(ids)).map((row) => ({ identity: row.name }))
  }

  private tagNames(ids: readonly number[]): string[] {
    return this.tagsById.all(JSON.stringify(ids)).map((row) => row.name)
  }

  private modelIds(kind: ModelKind, models: readonly { identity: string }[]): Resolved {
    const identities = [...new Set(models.map((model) => model.identity))]
    const rows = this.modelsByIdentity.all(kind, JSON.stringify(identities))
    return { ids: rows.map((row) => row.id), complete: rows.length === identities.length }
  }

  private tagIds(names: readonly string[]): Resolved {
    const keys = [...new Set(names.map(nameKey))]
    const rows = this.tagsByKey.all(JSON.stringify(keys))
    return { ids: rows.map((row) => row.id), complete: rows.length === keys.length }
  }
}

/** A LoRA filter's weight bounds, leaving out the ones not set. */
function weightBounds(loras: { minWeight?: number | undefined; maxWeight?: number | undefined }): {
  minWeight?: number
  maxWeight?: number
} {
  return {
    ...(loras.minWeight !== undefined ? { minWeight: loras.minWeight } : {}),
    ...(loras.maxWeight !== undefined ? { maxWeight: loras.maxWeight } : {})
  }
}

/** All needs every name; Any needs at least one. */
function satisfiable(found: Resolved, mode: SetMatchMode): boolean {
  return mode === SetMatchMode.All ? found.complete && found.ids.length > 0 : found.ids.length > 0
}
