import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ImageId } from '@domain/library'
import { formatFooocusParameters } from '@domain/fooocus-parameters'
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
import { FooocusJsonParser } from '@infrastructure/metadata/parsers/fooocus-json-parser'
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
  const models = new SqliteModelCatalog(db)
  reader = new GenerationDetailsReader(
    new SqliteGenerationRepository(db, models, versions),
    new SqliteMetadataRecordRepository(db, versions),
    createGenerationParser(),
    models
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
        modelId: expect.any(Number),
        name: 'ultraRealisticByStable_v25',
        hash: 'c69e98fa77',
        weight: null,
        weightSource: null
      },
      {
        kind: ResourceKind.Lora,
        modelId: expect.any(Number),
        name: 'add-detail-xl',
        hash: '0d9bd1b873',
        weight: 0.6,
        weightSource: MetadataOrigin.FooocusLog
      },
      {
        kind: ResourceKind.Lora,
        modelId: expect.any(Number),
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

describe('Fooocus parameters', () => {
  const fooocus = new FooocusJsonParser()
  /** Model hashes aren't part of what the copy carries, so they're compared without. */
  const withoutHashes = (fields: Record<string, unknown>): Record<string, unknown> => {
    const strip = (model: unknown): unknown =>
      model && typeof model === 'object' ? { ...model, hash: null } : model
    const stripped: Record<string, unknown> = { ...fields, checkpoint: strip(fields['checkpoint']) }
    if ('refiner' in fields) stripped['refiner'] = strip(fields['refiner'])
    if (Array.isArray(fields['loras'])) stripped['loras'] = fields['loras'].map(strip)
    return stripped
  }
  /** The merged fields Fooocus's JSON carries, in the shape the Fooocus parser reports them. */
  const fooocusFields = (details: GenerationDetails): Record<string, unknown> => {
    const fields = infotextFields(details)
    // An unknown LoRA weight is written as 1, A1111's reading of a bare tag.
    if (Array.isArray(fields['loras'])) {
      fields['loras'] = fields['loras'].map((lora: { weight: number | null }) => ({
        ...lora,
        weight: lora.weight ?? 1
      }))
    }
    if (details.styles) fields['styles'] = details.styles
    return withoutHashes(fields)
  }

  it.each(readdirSync(FIXTURES).filter((name) => /\.(png|webp|jpeg)$/.test(name)))(
    '%s formats to a JSON object the Fooocus parser reads back to the same fields',
    (name) => {
      const details = detailsOf(name)
      const text = formatFooocusParameters(details)
      expect(text.startsWith('{')).toBe(true)
      const reparsed = fooocus.parse(text)
      expect(reparsed).toBeDefined()
      const fields: Record<string, unknown> = { ...reparsed }
      delete fields['generator']
      delete fields['params']
      expect(withoutHashes(fields)).toEqual(fooocusFields(details))
    }
  )

  it('passes Fooocus-only fields through, with model file names taken from the log', () => {
    // Embedded Fooocus JSON names models by stem; the log entry for the same image has the files.
    const details = detailsOf('2026-09-27_20-36-27_8675.png')
    expect(details.paramsFormat).toBe(GenerationFormat.FooocusJson)
    expect(details.params['base_model']).not.toMatch(/\.safetensors$/)
    const parameters = JSON.parse(formatFooocusParameters(details)) as Record<string, string>
    expect(parameters['base_model']).toMatch(/\.safetensors$/)
    expect(parameters['lora_combined_1']).toMatch(/\.safetensors : /)
    for (const key of ['sharpness', 'adm_guidance', 'base_model_hash']) {
      expect(parameters[key]).toBe(details.params[key])
    }
  })

  it('derives the fields from the merged details when the params are not from Fooocus', () => {
    const a1111 = new A1111InfotextParser()
    const parsed = a1111.parse(
      'a cat\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 1, Size: 512x512'
    )
    if (!parsed) throw new Error('fixture text did not parse')
    const details: GenerationDetails = {
      ...detailsOf('2026-09-27_20-38-19_1754.png'),
      paramsFormat: GenerationFormat.A1111Infotext,
      params: parsed.params,
      fooocusParams: null
    }
    const parameters = JSON.parse(formatFooocusParameters(details)) as Record<string, unknown>
    expect(parameters).toMatchObject({
      prompt: details.prompt,
      negative_prompt: details.negativePrompt,
      steps: details.steps,
      guidance_scale: details.cfgScale,
      seed: details.seed,
      resolution: `(${details.width}, ${details.height})`,
      base_model: details.resources[0]?.name,
      lora_combined_1: 'add-detail-xl : 0.6',
      lora_combined_2: 'Pony Realism Slider : 1'
    })
    expect(parameters).not.toHaveProperty('Steps')
    expect(parameters).not.toHaveProperty('sharpness')
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
        {
          kind: ResourceKind.Lora,
          modelId: null,
          name: 'mystery',
          hash: null,
          weight: null,
          weightSource: null
        }
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
