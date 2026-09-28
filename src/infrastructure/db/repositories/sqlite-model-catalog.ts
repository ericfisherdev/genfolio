import type Database from 'better-sqlite3'
import { hashKindOf, modelDisplayName, modelIdentity } from '@domain/model-name'
import type { ModelDirectory } from '@domain/repositories'
import type { ModelKind } from '@shared/generation-kinds'

export type ModelId = number & { readonly __brand: 'ModelId' }

/** Checkpoints and LoRAs, one row per (kind, name identity), with every hash seen for each. */
export class SqliteModelCatalog implements ModelDirectory {
  private readonly upsertModel: Database.Statement<[ModelKind, string, string], { id: number }>
  private readonly addHash: Database.Statement<[number, string, string]>
  private readonly deleteUnused: Database.Statement
  private readonly selectId: Database.Statement<[ModelKind, string], number>

  constructor(db: Database.Database) {
    // The no-op update makes RETURNING yield the existing row's id on conflict.
    this.upsertModel = db.prepare(`
      INSERT INTO models (kind, identity, display_name) VALUES (?, ?, ?)
      ON CONFLICT (kind, identity) DO UPDATE SET kind = excluded.kind
      RETURNING id
    `)
    this.addHash = db.prepare(
      'INSERT OR IGNORE INTO model_hashes (model_id, hash, hash_kind) VALUES (?, ?, ?)'
    )
    this.selectId = db
      .prepare('SELECT id FROM models WHERE kind = ? AND identity = ?')
      .pluck() as Database.Statement<[ModelKind, string], number>
    this.deleteUnused = db.prepare(`
      DELETE FROM models WHERE id NOT IN (
        SELECT checkpoint_id FROM generations WHERE checkpoint_id IS NOT NULL
        UNION SELECT refiner_id FROM generations WHERE refiner_id IS NOT NULL
        UNION SELECT model_id FROM generation_loras
      )
    `)
  }

  /** The model's id, creating it on first sight and recording `hash` when given. */
  ensure(kind: ModelKind, name: string, hash: string | null): ModelId {
    const row = this.upsertModel.get(kind, modelIdentity(name), modelDisplayName(name))
    if (!row) throw new Error(`models upsert returned no row for a ${kind}`)
    if (hash) this.addHash.run(row.id, hash, hashKindOf(hash))
    return row.id as ModelId
  }

  idOf(kind: ModelKind, name: string): number | undefined {
    return this.selectId.get(kind, modelIdentity(name))
  }

  /** Deletes models no generation uses. Returns how many. */
  pruneUnused(): number {
    return this.deleteUnused.run().changes
  }
}
