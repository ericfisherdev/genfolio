import type Database from 'better-sqlite3'
import { GeneratorKind } from '@shared/generation-kinds'

export const PERF_IMAGES = 100_000
export const PERF_CHECKPOINTS = 50
export const PERF_LORAS = 500
export const PERF_MODEL_TAGS = 5
const FOLDERS = 100
const TAGS = 50

export interface PerfLibraryOptions {
  /** Most LoRAs on one image, 1 up to this many (default 5). */
  readonly maxLorasPerImage?: number
  /** Share of images that also name a refiner, which may equal their checkpoint (default 0). */
  readonly refinerShare?: number
}

/** mulberry32: deterministic, so every run builds the same library, and well mixed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS = Array.from({ length: 200 }, (_, index) => `word${index}`)

/**
 * 100k images with generations, 50 checkpoints and 500 LoRAs (1–5 per image by default), 50 tags (0–3
 * per image), 5 model tags on 25 LoRAs and 5 checkpoints, 5% favourites and ratings spread over 0–5.
 */
export function buildPerfLibrary(db: Database.Database, options: PerfLibraryOptions = {}): void {
  const { maxLorasPerImage = 5, refinerShare = 0 } = options
  const random = seeded(7)
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)] as T
  // A refiner is a checkpoint too; one in ten equals the image's own. Nothing is drawn without one.
  const refinerOf = (checkpoint: number): number | null => {
    if (refinerShare === 0 || random() >= refinerShare) return null
    return random() < 0.1 ? checkpoint : 1 + Math.floor(random() * PERF_CHECKPOINTS)
  }
  const words = (count: number): string =>
    Array.from({ length: count }, () => pick(WORDS)).join(', ')
  db.transaction(() => {
    db.prepare("INSERT INTO library_roots (id, path, added_at) VALUES (1, '/lib', 1)").run()
    const directory = db.prepare(
      'INSERT INTO directories (id, root_id, parent_id, rel_path) VALUES (?, 1, ?, ?)'
    )
    directory.run(1, null, '')
    for (let folder = 2; folder <= FOLDERS + 1; folder++) directory.run(folder, 1, `f${folder}`)
    const model = db.prepare(
      'INSERT INTO models (id, kind, identity, display_name) VALUES (?, ?, ?, ?)'
    )
    for (let id = 1; id <= PERF_CHECKPOINTS; id++)
      model.run(id, 'checkpoint', `ckpt${id}`, `ckpt${id}`)
    for (let id = 1; id <= PERF_LORAS; id++) {
      model.run(PERF_CHECKPOINTS + id, 'lora', `lora${id}`, `lora${id}`)
    }
    const image = db.prepare(
      `INSERT INTO images (id, directory_id, file_name, format, size_bytes, mtime_ms, width,
        height, created_at, added_at, metadata_version) VALUES (?, ?, ?, 'png', 1, 1, 832, 1216, ?, 1, 1)`
    )
    const generation = db.prepare(
      `INSERT INTO generations (image_id, generator, origin, prompt, negative_prompt, seed,
        checkpoint_id, refiner_id, params_json) VALUES (?, ?, 'png-text', ?, ?, ?, ?, ?, '{}')`
    )
    const link = db.prepare(
      'INSERT OR IGNORE INTO generation_loras (image_id, model_id, position, weight) VALUES (?, ?, ?, ?)'
    )
    const tag = db.prepare('INSERT INTO tags (id, name, name_key, created_at) VALUES (?, ?, ?, 1)')
    for (let id = 1; id <= TAGS; id++) tag.run(id, `tag${id}`, `tag${id}`)
    const tagged = db.prepare('INSERT OR IGNORE INTO image_tags (image_id, tag_id) VALUES (?, ?)')
    // Model tags: 5 tags over 5% of the LoRAs and 10% of the checkpoints, by identity.
    const modelTag = db.prepare(
      'INSERT INTO model_tags (id, name, name_key, created_at) VALUES (?, ?, ?, 1)'
    )
    const modelLink = db.prepare(
      'INSERT OR IGNORE INTO model_tag_links (tag_id, kind, identity, created_at) VALUES (?, ?, ?, 1)'
    )
    for (let id = 1; id <= PERF_MODEL_TAGS; id++) modelTag.run(id, `mtag${id}`, `mtag${id}`)
    for (let n = 1; n <= PERF_LORAS; n += 20)
      modelLink.run(1 + (n % PERF_MODEL_TAGS), 'lora', `lora${n}`)
    for (let n = 1; n <= PERF_CHECKPOINTS; n += 10) {
      modelLink.run(1 + (n % PERF_MODEL_TAGS), 'checkpoint', `ckpt${n}`)
    }
    const mark = db.prepare('UPDATE images SET is_favorite = ?, rating = ? WHERE id = ?')
    for (let id = 1; id <= PERF_IMAGES; id++) {
      image.run(id, 2 + (id % FOLDERS), `${id}.png`, id)
      // Drawn in this order so a default library is the same on every run.
      const generator = random() < 0.5 ? GeneratorKind.A1111 : GeneratorKind.Fooocus
      const prompt = words(12)
      const negativePrompt = words(4)
      const seed = String(Math.floor(random() * 5000))
      const checkpoint = 1 + Math.floor(random() * PERF_CHECKPOINTS)
      generation.run(id, generator, prompt, negativePrompt, seed, checkpoint, refinerOf(checkpoint))
      const loraCount = 1 + Math.floor(random() * maxLorasPerImage)
      for (let position = 0; position < loraCount; position++) {
        const weight = random() < 0.1 ? null : Math.round(random() * 150) / 100
        link.run(id, PERF_CHECKPOINTS + 1 + Math.floor(random() * PERF_LORAS), position, weight)
      }
      // 0–3 tags each; 5% favourites; ratings spread over 0–5.
      const tagCount = Math.floor(random() * 4)
      for (let n = 0; n < tagCount; n++) tagged.run(id, 1 + Math.floor(random() * TAGS))
      mark.run(random() < 0.05 ? 1 : 0, Math.floor(random() * 6), id)
    }
  })()
  db.exec('ANALYZE')
}
