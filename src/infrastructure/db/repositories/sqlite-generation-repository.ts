import type Database from 'better-sqlite3'
import type { LoraUse, ModelRef, StoredGeneration } from '@domain/generation'
import type { ImageId } from '@domain/library'
import type { GenerationRepository, ImageVersion } from '@domain/repositories'
import { type GeneratorKind, ModelKind } from '@shared/generation-kinds'
import type { MetadataOrigin } from '@shared/metadata-kinds'
import type { SqliteImageVersionCheck } from './sqlite-image-version-check'
import type { SqliteModelCatalog } from './sqlite-model-catalog'

type GenerationParams = [
  imageId: number,
  generator: string,
  origin: string,
  prompt: string | null,
  negativePrompt: string | null,
  seed: string | null,
  steps: number | null,
  cfgScale: number | null,
  sampler: string | null,
  scheduler: string | null,
  width: number | null,
  height: number | null,
  checkpointId: number | null,
  checkpointHash: string | null,
  refinerId: number | null,
  refinerHash: string | null,
  vae: string | null,
  stylesJson: string | null,
  performance: string | null,
  paramsJson: string
]

interface GenerationRow {
  generator: string
  origin: string
  prompt: string | null
  negative_prompt: string | null
  seed: string | null
  steps: number | null
  cfg_scale: number | null
  sampler: string | null
  scheduler: string | null
  width: number | null
  height: number | null
  checkpoint_name: string | null
  checkpoint_hash: string | null
  refiner_name: string | null
  refiner_hash: string | null
  vae: string | null
  styles_json: string | null
  performance: string | null
  params_json: string
}

interface LoraRow {
  name: string
  weight: number | null
  hash: string | null
}

export class SqliteGenerationRepository implements GenerationRepository {
  private readonly insertGeneration: Database.Statement<GenerationParams>
  private readonly deleteGeneration: Database.Statement<[number]>
  private readonly insertLora: Database.Statement<
    [number, number, number, number | null, string | null]
  >
  private readonly selectGeneration: Database.Statement<[number], GenerationRow>
  private readonly selectLoras: Database.Statement<[number], LoraRow>

  constructor(
    private readonly db: Database.Database,
    private readonly models: SqliteModelCatalog,
    private readonly versions: SqliteImageVersionCheck
  ) {
    this.deleteGeneration = db.prepare('DELETE FROM generations WHERE image_id = ?')
    this.insertGeneration = db.prepare(`
      INSERT INTO generations (
        image_id, generator, origin, prompt, negative_prompt, seed, steps, cfg_scale, sampler,
        scheduler, width, height, checkpoint_id, checkpoint_hash, refiner_id, refiner_hash, vae,
        styles_json, performance, params_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    // A LoRA listed twice under names with one identity keeps its first position.
    this.insertLora = db.prepare(`
      INSERT OR IGNORE INTO generation_loras (image_id, model_id, position, weight, hash)
      VALUES (?, ?, ?, ?, ?)
    `)
    this.selectGeneration = db.prepare(`
      SELECT g.*, checkpoint.display_name AS checkpoint_name, refiner.display_name AS refiner_name
      FROM generations g
      LEFT JOIN models checkpoint ON checkpoint.id = g.checkpoint_id
      LEFT JOIN models refiner ON refiner.id = g.refiner_id
      WHERE g.image_id = ?
    `)
    this.selectLoras = db.prepare(`
      SELECT models.display_name AS name, links.weight, links.hash
      FROM generation_loras links JOIN models ON models.id = links.model_id
      WHERE links.image_id = ?
      ORDER BY links.position
    `)
  }

  replace(version: ImageVersion, generation: StoredGeneration | null): boolean {
    return this.db.transaction(() => {
      if (!this.versions.holds(version)) return false
      this.write(version.id, generation)
      return true
    })()
  }

  replaceFresh(imageId: ImageId, generation: StoredGeneration | null): void {
    this.write(imageId, generation)
  }

  private write(imageId: ImageId, generation: StoredGeneration | null): void {
    this.deleteGeneration.run(imageId)
    if (generation) this.insert(imageId, generation)
  }

  find(imageId: ImageId): StoredGeneration | undefined {
    const row = this.selectGeneration.get(imageId)
    return row ? generationFrom(row, this.selectLoras.all(imageId)) : undefined
  }

  pruneUnusedModels(): number {
    return this.models.pruneUnused()
  }

  private insert(imageId: ImageId, generation: StoredGeneration): void {
    const checkpoint = this.modelId(ModelKind.Checkpoint, generation.checkpoint)
    const refiner = this.modelId(ModelKind.Checkpoint, generation.refiner)
    this.insertGeneration.run(
      imageId,
      generation.generator,
      generation.origin,
      generation.prompt ?? null,
      generation.negativePrompt ?? null,
      generation.seed ?? null,
      generation.steps ?? null,
      generation.cfgScale ?? null,
      generation.sampler ?? null,
      generation.scheduler ?? null,
      generation.width ?? null,
      generation.height ?? null,
      checkpoint,
      generation.checkpoint?.hash ?? null,
      refiner,
      generation.refiner?.hash ?? null,
      generation.vae ?? null,
      generation.styles ? JSON.stringify(generation.styles) : null,
      generation.performance ?? null,
      JSON.stringify(generation.params)
    )
    for (const [position, lora] of (generation.loras ?? []).entries()) {
      const modelId = this.models.ensure(ModelKind.Lora, lora.name, lora.hash)
      this.insertLora.run(imageId, modelId, position, lora.weight, lora.hash)
    }
  }

  private modelId(kind: ModelKind, model: ModelRef | undefined): number | null {
    return model ? this.models.ensure(kind, model.name, model.hash) : null
  }
}

function generationFrom(row: GenerationRow, loras: readonly LoraRow[]): StoredGeneration {
  const optional = <K extends string, V>(key: K, value: V | null): Partial<Record<K, V>> =>
    value === null ? {} : ({ [key]: value } as Record<K, V>)
  return {
    generator: row.generator as GeneratorKind,
    origin: row.origin as MetadataOrigin,
    ...optional('prompt', row.prompt),
    ...optional('negativePrompt', row.negative_prompt),
    ...optional('seed', row.seed),
    ...optional('steps', row.steps),
    ...optional('cfgScale', row.cfg_scale),
    ...optional('sampler', row.sampler),
    ...optional('scheduler', row.scheduler),
    ...optional('width', row.width),
    ...optional('height', row.height),
    ...optional('checkpoint', modelRef(row.checkpoint_name, row.checkpoint_hash)),
    ...optional('refiner', modelRef(row.refiner_name, row.refiner_hash)),
    ...optional('vae', row.vae),
    ...optional('loras', loras.length > 0 ? loras.map(loraUse) : null),
    ...optional(
      'styles',
      row.styles_json === null ? null : (JSON.parse(row.styles_json) as string[])
    ),
    ...optional('performance', row.performance),
    params: JSON.parse(row.params_json) as Record<string, string>
  }
}

function modelRef(name: string | null, hash: string | null): ModelRef | null {
  return name === null ? null : { name, hash }
}

function loraUse(row: LoraRow): LoraUse {
  return { name: row.name, weight: row.weight, hash: row.hash }
}
