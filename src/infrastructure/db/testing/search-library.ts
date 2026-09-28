import type Database from 'better-sqlite3'
import type { StoredGeneration } from '@domain/generation'
import type { DirectoryId, ImageId } from '@domain/library'
import { GeneratorKind } from '@shared/generation-kinds'
import { ImageFormat } from '@shared/image-format'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { SqliteDirectoryRepository } from '../repositories/sqlite-directory-repository'
import { SqliteGenerationRepository } from '../repositories/sqlite-generation-repository'
import { SqliteImageRepository } from '../repositories/sqlite-image-repository'
import { SqliteImageVersionCheck } from '../repositories/sqlite-image-version-check'
import { SqliteLibraryRootRepository } from '../repositories/sqlite-library-root-repository'
import { SqliteModelCatalog } from '../repositories/sqlite-model-catalog'
import { migratedMemoryDb } from './migrated-memory-db'

const generation = (fields: Partial<StoredGeneration>): StoredGeneration => ({
  generator: GeneratorKind.A1111,
  origin: MetadataOrigin.PngText,
  params: {},
  ...fields
})

/**
 * Six images for search tests: 1–3 in folder `a`, 4–6 in folder `b`; image 5 has no
 * generation data. Checkpoints alpha/beta (6 uses alpha as refiner), LoRAs detail/style.
 */
export const SEARCH_LIBRARY: Readonly<Record<number, StoredGeneration | null>> = {
  1: generation({
    prompt: 'red hair girl, cyberpunk city',
    negativePrompt: 'blurry',
    seed: '1',
    checkpoint: { name: 'alpha', hash: null },
    loras: [
      { name: 'detail', weight: 0.8, hash: null },
      { name: 'style', weight: 1, hash: null }
    ]
  }),
  2: generation({
    generator: GeneratorKind.Fooocus,
    prompt: 'red car on a road',
    negativePrompt: 'low quality',
    seed: '2',
    checkpoint: { name: 'alpha', hash: null },
    loras: [{ name: 'detail', weight: 0.3, hash: null }]
  }),
  3: generation({
    generator: GeneratorKind.Fooocus,
    prompt: 'blue sky',
    negativePrompt: 'red',
    seed: '1',
    checkpoint: { name: 'beta', hash: null },
    loras: [{ name: 'style', weight: null, hash: null }]
  }),
  4: generation({
    prompt: 'red hair girl, cyberpunk city',
    seed: '3',
    checkpoint: { name: 'beta', hash: null }
  }),
  5: null,
  6: generation({
    prompt: 'café table',
    checkpoint: { name: 'beta', hash: null },
    refiner: { name: 'alpha', hash: null }
  })
}

export interface SearchLibrary {
  readonly db: Database.Database
  /** Library image number (1–6) → image id. */
  readonly ids: ReadonlyMap<number, ImageId>
  readonly folderA: DirectoryId
  readonly folderB: DirectoryId
  modelId(kind: 'checkpoint' | 'lora', name: string): number
}

export function searchLibrary(): SearchLibrary {
  const db = migratedMemoryDb()
  const root = new SqliteLibraryRootRepository(db).add('/lib', 1)
  const directories = new SqliteDirectoryRepository(db)
  const folderA = directories.ensure(root.id, 'a')
  const folderB = directories.ensure(root.id, 'b')
  const images = new SqliteImageRepository(db)
  const versions = new SqliteImageVersionCheck(db)
  const generations = new SqliteGenerationRepository(db, new SqliteModelCatalog(db), versions)
  const ids = new Map<number, ImageId>()
  for (const [key, stored] of Object.entries(SEARCH_LIBRARY)) {
    const n = Number(key)
    const [version] = images.upsertMany(
      [
        {
          directoryId: n <= 3 ? folderA : folderB,
          fileName: `${n}.png`,
          format: ImageFormat.Png,
          sizeBytes: 1,
          mtimeMs: 1,
          width: 10,
          height: 10,
          createdAt: n
        }
      ],
      1
    )
    if (!version) throw new Error('upsert returned no version')
    ids.set(n, version.id)
    generations.replace(version, stored)
  }
  const modelId = (kind: string, name: string): number =>
    db
      .prepare('SELECT id FROM models WHERE kind = ? AND display_name = ?')
      .pluck()
      .get(kind, name) as number
  return { db, ids, folderA, folderB, modelId }
}
