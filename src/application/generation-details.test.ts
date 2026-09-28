import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ImageId } from '@domain/library'
import { formatInfotext, generationText } from '@domain/generation-text'
import { SqliteDirectoryRepository } from '@infrastructure/db/repositories/sqlite-directory-repository'
import { SqliteGenerationRepository } from '@infrastructure/db/repositories/sqlite-generation-repository'
import { SqliteImageRepository } from '@infrastructure/db/repositories/sqlite-image-repository'
import { SqliteImageVersionCheck } from '@infrastructure/db/repositories/sqlite-image-version-check'
import { SqliteLibraryRootRepository } from '@infrastructure/db/repositories/sqlite-library-root-repository'
import { SqliteMetadataRecordRepository } from '@infrastructure/db/repositories/sqlite-metadata-record-repository'
import { SqliteModelCatalog } from '@infrastructure/db/repositories/sqlite-model-catalog'
import { migratedMemoryDb } from '@infrastructure/db/testing/migrated-memory-db'
import { A1111InfotextParser } from '@infrastructure/metadata/parsers/a1111-infotext-parser'
import type { GenerationDetails } from '@shared/generation'
import { CopyVariant, GenerationFormat, ResourceKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { createGenerationParser, createScanRoot } from '../service/scan-root-factory'
import { GenerationDetailsReader } from './generation-details-reader'

const FIXTURES = resolve(__dirname, '../../tests/fixtures/fooocus')
let dir: string
let db: Database.Database
let reader: GenerationDetailsReader
const ids = new Map<string, ImageId>()

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'genfolio-details-'))
  cpSync(FIXTURES, dir, { recursive: true, filter: (path) => !path.includes('expected') })
  db = migratedMemoryDb()
  const images = new SqliteImageRepository(db)
  const root = new SqliteLibraryRootRepository(db).add(dir, 1)
  await createScanRoot(db, {
    directories: new SqliteDirectoryRepository(db),
    images,
    logger: { warn: vi.fn() },
    fileRef: (path) => path,
    now: () => 1
  }).run(root, new AbortController().signal)
  for (const stat of images.fileStatsByRoot(root.id)) ids.set(stat.fileName, stat.id)
  const versions = new SqliteImageVersionCheck(db)
  reader = new GenerationDetailsReader(
    new SqliteGenerationRepository(db, new SqliteModelCatalog(db), versions),
    new SqliteMetadataRecordRepository(db, versions),
    createGenerationParser()
  )
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const detailsOf = (fileName: string): GenerationDetails => {
  const details = reader.details(ids.get(fileName) ?? (0 as ImageId))
  if (!details) throw new Error(`no details for ${fileName}`)
  return details
}

/** The fields infotext carries, in the shape the A1111 parser reports them. */
function infotextFields(details: GenerationDetails): Record<string, unknown> {
  const model = (kind: ResourceKind): { name: string; hash: string | null } | undefined => {
    const resource = details.resources.find((r) => r.kind === kind)
    return resource ? { name: resource.name, hash: resource.hash } : undefined
  }
  const fields: Record<string, unknown> = {
    prompt: details.prompt ?? undefined,
    negativePrompt: details.negativePrompt ?? undefined,
    seed: details.seed ?? undefined,
    steps: details.steps ?? undefined,
    cfgScale: details.cfgScale ?? undefined,
    sampler: details.sampler ?? undefined,
    scheduler: details.scheduler ?? undefined,
    width: details.width ?? undefined,
    height: details.height ?? undefined,
    vae: details.vae ?? undefined,
    performance: details.performance ?? undefined,
    checkpoint: model(ResourceKind.Checkpoint),
    refiner: model(ResourceKind.Refiner),
    loras: details.resources
      .filter((r) => r.kind === ResourceKind.Lora)
      .map((r) => ({ name: r.name, weight: r.weight, hash: r.hash }))
  }
  if ((fields['loras'] as unknown[]).length === 0) delete fields['loras']
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
}

describe('GenerationDetailsReader', () => {
  it('returns null for an image without a generation', () => {
    expect(reader.details(999_999 as ImageId)).toBeNull()
  })

  it('lists resources checkpoint first with weight sources, and raw records by origin', () => {
    const details = detailsOf('2026-09-27_20-38-19_1754.png')
    expect(details.resources).toEqual([
      {
        kind: ResourceKind.Checkpoint,
        name: 'ultraRealisticByStable_v25',
        hash: 'c69e98fa77',
        weight: null,
        weightSource: null
      },
      {
        kind: ResourceKind.Lora,
        name: 'add-detail-xl',
        hash: '0d9bd1b873',
        weight: 0.6,
        weightSource: MetadataOrigin.FooocusLog
      },
      {
        kind: ResourceKind.Lora,
        name: 'Pony Realism Slider',
        hash: '0fc4c9f8d8',
        weight: 1,
        weightSource: MetadataOrigin.FooocusLog
      }
    ])
    expect(details.sources.map((source) => source.origin)).toEqual([
      MetadataOrigin.PngText,
      MetadataOrigin.FooocusLog
    ])
  })
})

describe('infotext round trip', () => {
  const a1111 = new A1111InfotextParser()

  it.each(readdirSync(FIXTURES).filter((name) => /\.(png|webp|jpeg)$/.test(name)))(
    '%s formats to infotext that parses back to the same fields',
    (name) => {
      const details = detailsOf(name)
      const reparsed = a1111.parse(formatInfotext(details))
      expect(reparsed).toBeDefined()
      const fields: Record<string, unknown> = { ...reparsed }
      delete fields['generator']
      delete fields['params']
      expect(fields).toEqual(infotextFields(details))
    }
  )
})

describe('A1111 params in the infotext', () => {
  it('carries params outside the merged fields through Copy all for A1111 sources', () => {
    const a1111 = new A1111InfotextParser()
    const text =
      'a cat\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 1, Size: 512x512, ' +
      'Clip skip: 2, Denoising strength: 0.4, Hires upscale: 2, ADetailer model: "face_yolov8n.pt"'
    const parsed = a1111.parse(text)
    if (!parsed) throw new Error('fixture text did not parse')
    const details: GenerationDetails = {
      ...detailsOf('2026-09-27_20-38-19_1754.png'),
      paramsFormat: GenerationFormat.A1111Infotext,
      params: parsed.params
    }
    const all = formatInfotext(details)
    expect(all).toContain('Clip skip: 2, Denoising strength: 0.4, Hires upscale: 2')
    expect(all).toContain('ADetailer model: face_yolov8n.pt')
    expect(a1111.parse(all)?.params).toMatchObject({ 'Clip skip': '2', 'Hires upscale': '2' })
    expect(all.match(/Steps: /g)).toHaveLength(1)
  })

  it('leaves Fooocus JSON keys out of the infotext', () => {
    const details = detailsOf('2026-09-27_20-36-27_8675.png')
    expect(details.paramsFormat).toBe(GenerationFormat.FooocusJson)
    expect(formatInfotext(details)).not.toContain('base_model')
  })
})

describe('generationText', () => {
  const details = (): GenerationDetails => detailsOf('2026-09-27_20-38-19_1754.png')

  it('appends LoRA tags the prompt lacks, bare when the weight is unknown', () => {
    const base = details()
    const withTagged: GenerationDetails = {
      ...base,
      prompt: 'p <lora:add-detail-xl:0.2>',
      resources: [
        ...base.resources,
        { kind: ResourceKind.Lora, name: 'mystery', hash: null, weight: null, weightSource: null }
      ]
    }
    expect(generationText(withTagged, CopyVariant.PromptWithLoras)).toBe(
      'p <lora:add-detail-xl:0.2> <lora:Pony Realism Slider:1> <lora:mystery>'
    )
  })

  it('is null when the text would be empty', () => {
    expect(generationText({ ...details(), negativePrompt: null }, CopyVariant.Negative)).toBeNull()
    expect(generationText({ ...details(), prompt: null }, CopyVariant.Prompt)).toBeNull()
  })
})
