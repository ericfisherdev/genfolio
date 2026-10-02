import type Database from 'better-sqlite3'
import type { ModelCivitaiRepository, ModelHashLookup } from '@domain/repositories'
import type { CivitaiRecord } from '@shared/model-civitai'
import type { ModelKey } from '@shared/models'

export class SqliteModelCivitaiRepository implements ModelCivitaiRepository, ModelHashLookup {
  private readonly upsert: Database.Statement
  private readonly updateLinked: Database.Statement
  private readonly selectLink: Database.Statement
  private readonly deleteLink: Database.Statement
  private readonly selectHashes: Database.Statement

  constructor(db: Database.Database) {
    this.upsert = db.prepare(`
      INSERT INTO model_civitai (
        kind, identity, civitai_model_id, civitai_version_id, model_name, version_name,
        base_model, trigger_words_json, description, version_description, creator, nsfw,
        tags_json, downloads, thumbs_up, published_at, fetched_at
      ) VALUES (
        @kind, @identity, @modelId, @versionId, @modelName, @versionName,
        @baseModel, @triggerWords, @description, @versionDescription, @creator, @nsfw,
        @tags, @downloads, @thumbsUp, @publishedAt, @now
      )
      ON CONFLICT (kind, identity) DO UPDATE SET
        civitai_model_id = excluded.civitai_model_id,
        civitai_version_id = excluded.civitai_version_id,
        model_name = excluded.model_name, version_name = excluded.version_name,
        base_model = excluded.base_model, trigger_words_json = excluded.trigger_words_json,
        description = excluded.description,
        version_description = excluded.version_description, creator = excluded.creator,
        nsfw = excluded.nsfw, tags_json = excluded.tags_json, downloads = excluded.downloads,
        thumbs_up = excluded.thumbs_up, published_at = excluded.published_at,
        fetched_at = excluded.fetched_at`)
    this.updateLinked = db.prepare(`
      UPDATE model_civitai SET
        model_name = @modelName, version_name = @versionName, base_model = @baseModel,
        trigger_words_json = @triggerWords, description = @description,
        version_description = @versionDescription, creator = @creator, nsfw = @nsfw,
        tags_json = @tags, downloads = @downloads, thumbs_up = @thumbsUp,
        published_at = @publishedAt, fetched_at = @now
      WHERE kind = @kind AND identity = @identity AND civitai_version_id = @versionId`)
    this.selectLink = db.prepare(
      `SELECT civitai_model_id AS modelId, civitai_version_id AS versionId
       FROM model_civitai WHERE kind = ? AND identity = ?`
    )
    this.deleteLink = db.prepare('DELETE FROM model_civitai WHERE kind = ? AND identity = ?')
    this.selectHashes = db
      .prepare(
        `SELECT DISTINCT h.hash FROM model_hashes h JOIN models m ON m.id = h.model_id
         WHERE m.kind = ? AND m.identity = ? ORDER BY length(h.hash) DESC, h.hash`
      )
      .pluck()
  }

  save({ kind, identity }: ModelKey, record: CivitaiRecord, now: number): void {
    this.upsert.run({ kind, identity, ...this.columnsOf(record), now })
  }

  update(
    { kind, identity }: ModelKey,
    versionId: number,
    record: CivitaiRecord,
    now: number
  ): boolean {
    return (
      this.updateLinked.run({ kind, identity, ...this.columnsOf(record), versionId, now }).changes >
      0
    )
  }

  private columnsOf(record: CivitaiRecord): Record<string, unknown> {
    return {
      modelId: record.modelId,
      versionId: record.versionId,
      modelName: record.modelName,
      versionName: record.versionName,
      baseModel: record.baseModel,
      triggerWords: JSON.stringify(record.triggerWords),
      description: record.description,
      versionDescription: record.versionDescription,
      creator: record.creator,
      nsfw: record.nsfw ? 1 : 0,
      tags: JSON.stringify(record.tags),
      downloads: record.downloads,
      thumbsUp: record.thumbsUp,
      publishedAt: record.publishedAt
    }
  }

  linkOf({ kind, identity }: ModelKey): { modelId: number; versionId: number } | undefined {
    return this.selectLink.get(kind, identity) as { modelId: number; versionId: number } | undefined
  }

  remove({ kind, identity }: ModelKey): boolean {
    return this.deleteLink.run(kind, identity).changes > 0
  }

  hashesOf({ kind, identity }: ModelKey): string[] {
    return this.selectHashes.all(kind, identity) as string[]
  }
}
