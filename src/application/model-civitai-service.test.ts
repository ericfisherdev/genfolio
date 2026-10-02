import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CivitaiUnavailableError,
  type CivitaiCatalog,
  type CivitaiModel,
  type CivitaiVersion
} from '@domain/civitai'
import { SqliteModelCivitaiRepository } from '@infrastructure/db/repositories/sqlite-model-civitai-repository'
import { SqliteModelInfoRepository } from '@infrastructure/db/repositories/sqlite-model-info-repository'
import { searchLibrary } from '@infrastructure/db/testing/search-library'
import { CivitaiOutcome } from '@shared/civitai'
import { ModelKind } from '@shared/generation-kinds'
import { ModelInfoService } from './model-info-service'
import { ModelCivitaiService } from './model-civitai-service'

const version = (id: number, fields: Partial<CivitaiVersion> = {}): CivitaiVersion => ({
  id,
  name: `v${id}`,
  baseModel: 'SDXL 1.0',
  trainedWords: ['add detail'],
  description: null,
  publishedAt: null,
  files: [],
  ...fields
})

const civitaiModel = (
  id: number,
  versions: CivitaiVersion[],
  name = `model ${id}`
): CivitaiModel => ({
  id,
  name,
  type: 'LORA',
  description: 'About it',
  creator: 'someone',
  nsfw: false,
  tags: ['detail'],
  downloads: 10,
  thumbsUp: 2,
  versions
})

const key = { kind: ModelKind.Lora, identity: 'detail' }

let catalog: { [M in keyof CivitaiCatalog]: ReturnType<typeof vi.fn> }
let service: ModelCivitaiService
let db: ReturnType<typeof searchLibrary>['db']

function addHashes(...hashes: string[]): void {
  const id = db.prepare("SELECT id FROM models WHERE identity = 'detail'").pluck().get()
  for (const hash of hashes) {
    db.prepare('INSERT INTO model_hashes (model_id, hash, hash_kind) VALUES (?, ?, ?)').run(
      id,
      hash,
      'x'
    )
  }
}

beforeEach(() => {
  db = searchLibrary().db
  catalog = { versionByHash: vi.fn(), model: vi.fn(), searchModels: vi.fn() }
  const links = new SqliteModelCivitaiRepository(db)
  const models = new ModelInfoService(new SqliteModelInfoRepository(db), () => 1)
  service = new ModelCivitaiService(
    catalog as unknown as CivitaiCatalog,
    links,
    links,
    models,
    () => 42
  )
})

describe('ModelCivitaiService.lookup', () => {
  it('links the version a file hash matches, and fills the info from it', async () => {
    addHashes('0d9bd1b873a7', '0d9bd1b873')
    catalog.versionByHash.mockImplementation(async (hash: string) =>
      hash === '0d9bd1b873' ? { modelId: 5, versionId: 9 } : null
    )
    catalog.model.mockResolvedValue(
      civitaiModel(5, [version(8), version(9, { baseModel: 'Pony' })])
    )
    const result = await service.lookup(key)
    expect(result).toMatchObject({
      outcome: CivitaiOutcome.Linked,
      model: {
        baseModel: 'Pony',
        triggerWords: ['add detail'],
        civitai: { modelId: 5, versionId: 9, versionName: 'v9', fetchedAt: 42 }
      }
    })
    expect(catalog.model).toHaveBeenCalledWith(5)
  })

  it('asks Civitai nothing for a model whose hash was never seen', async () => {
    await expect(service.lookup(key)).resolves.toEqual({ outcome: CivitaiOutcome.NotFound })
    expect(catalog.versionByHash).not.toHaveBeenCalled()
  })

  it('is NotFound when no hash matches', async () => {
    addHashes('aaaaaaaaaa')
    catalog.versionByHash.mockResolvedValue(null)
    await expect(service.lookup(key)).resolves.toEqual({ outcome: CivitaiOutcome.NotFound })
  })

  it('tries at most six hashes', async () => {
    addHashes('a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8')
    catalog.versionByHash.mockResolvedValue(null)
    await service.lookup(key)
    expect(catalog.versionByHash).toHaveBeenCalledTimes(6)
  })

  it('still links when one hash fails but another matches', async () => {
    addHashes('0d9bd1b873a7', '0d9bd1b873')
    catalog.versionByHash.mockImplementation(async (hash: string) => {
      if (hash.length === 12) throw new CivitaiUnavailableError('Could not reach Civitai')
      return { modelId: 5, versionId: 9 }
    })
    catalog.model.mockResolvedValue(civitaiModel(5, [version(9)]))
    await expect(service.lookup(key)).resolves.toMatchObject({ outcome: CivitaiOutcome.Linked })
  })

  it('reports Civitai being unavailable when no hash matched', async () => {
    addHashes('0d9bd1b873')
    catalog.versionByHash.mockRejectedValue(new CivitaiUnavailableError('Could not reach Civitai'))
    await expect(service.lookup(key)).rejects.toBeInstanceOf(CivitaiUnavailableError)
  })

  it('is Missing for a model nothing knows', async () => {
    await expect(service.lookup({ kind: ModelKind.Lora, identity: 'ghost' })).resolves.toEqual({
      outcome: CivitaiOutcome.Missing
    })
  })
})

describe('ModelCivitaiService.link', () => {
  it('stores the chosen version and replaces an earlier link', async () => {
    catalog.model.mockResolvedValue(civitaiModel(5, [version(8), version(9)]))
    await service.link(key, 5, 8)
    const result = await service.link(key, 5, 9)
    expect(result).toMatchObject({
      outcome: CivitaiOutcome.Linked,
      model: { civitai: { versionId: 9 } }
    })
  })

  it('is NotFound when Civitai has no such model or version', async () => {
    catalog.model.mockResolvedValueOnce(null).mockResolvedValueOnce(civitaiModel(5, [version(8)]))
    await expect(service.link(key, 5, 8)).resolves.toEqual({ outcome: CivitaiOutcome.NotFound })
    await expect(service.link(key, 5, 99)).resolves.toEqual({ outcome: CivitaiOutcome.NotFound })
  })

  it('stores nothing when Civitai cannot answer', async () => {
    catalog.model.mockRejectedValue(new CivitaiUnavailableError('Civitai did not answer in time'))
    await expect(service.link(key, 5, 8)).rejects.toThrow('did not answer in time')
    expect(db.prepare('SELECT COUNT(*) FROM model_civitai').pluck().get()).toBe(0)
  })
})

describe('ModelCivitaiService.refresh and unlink', () => {
  it('fetches the linked version again', async () => {
    catalog.model.mockResolvedValue(civitaiModel(5, [version(8, { trainedWords: ['old'] })]))
    await service.link(key, 5, 8)
    catalog.model.mockResolvedValue(civitaiModel(5, [version(8, { trainedWords: ['new'] })]))
    await expect(service.refresh(key)).resolves.toMatchObject({
      model: { triggerWords: ['new'] }
    })
  })

  it('does not bring back a link removed while Civitai was answering', async () => {
    catalog.model.mockResolvedValue(civitaiModel(5, [version(8)]))
    await service.link(key, 5, 8)
    let answer: (model: CivitaiModel) => void = () => undefined
    catalog.model.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const refreshing = service.refresh(key)
    expect(service.unlink(key)).toBe(true)
    answer(civitaiModel(5, [version(8, { trainedWords: ['new'] })]))
    await expect(refreshing).resolves.toEqual({ outcome: CivitaiOutcome.Unlinked })
    expect(service.unlink(key)).toBe(false)
    expect(db.prepare('SELECT COUNT(*) FROM model_civitai').pluck().get()).toBe(0)
  })

  it('does not overwrite a link changed to another version while Civitai was answering', async () => {
    catalog.model.mockResolvedValue(civitaiModel(5, [version(8), version(9)]))
    await service.link(key, 5, 8)
    let answer: (model: CivitaiModel) => void = () => undefined
    catalog.model.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const refreshing = service.refresh(key)
    catalog.model.mockResolvedValue(civitaiModel(5, [version(8), version(9)]))
    await service.link(key, 5, 9)
    answer(civitaiModel(5, [version(8, { trainedWords: ['stale'] }), version(9)]))
    await expect(refreshing).resolves.toEqual({ outcome: CivitaiOutcome.Unlinked })
    expect(db.prepare('SELECT civitai_version_id FROM model_civitai').pluck().get()).toBe(9)
  })

  it('has nothing to refresh without a link', async () => {
    await expect(service.refresh(key)).resolves.toEqual({ outcome: CivitaiOutcome.NotFound })
    expect(catalog.model).not.toHaveBeenCalled()
  })

  it('unlinks, once', async () => {
    catalog.model.mockResolvedValue(civitaiModel(5, [version(8)]))
    await service.link(key, 5, 8)
    expect(service.unlink(key)).toBe(true)
    expect(service.unlink(key)).toBe(false)
  })
})

describe('ModelCivitaiService.search', () => {
  it('lists versions, those with a file named like the model first', async () => {
    catalog.searchModels.mockResolvedValue({
      nextCursor: null,
      models: [
        civitaiModel(1, [
          version(10, {
            files: [
              {
                name: 'other.safetensors',
                sizeKb: 1,
                type: 'Model',
                primary: true,
                downloadUrl: null,
                hashes: {}
              }
            ]
          })
        ]),
        civitaiModel(2, [
          version(20),
          version(21, {
            files: [
              {
                name: 'Detail.safetensors',
                sizeKb: 1,
                type: 'Model',
                primary: true,
                downloadUrl: null,
                hashes: {}
              }
            ]
          })
        ])
      ]
    })
    const found = await service.search({ kind: ModelKind.Lora, text: 'detail', identity: 'detail' })
    expect(found.map((candidate) => [candidate.versionId, candidate.matchesFileName])).toEqual([
      [21, true],
      [10, false],
      [20, false]
    ])
    expect(found[0]).toMatchObject({
      modelId: 2,
      baseModel: 'SDXL 1.0',
      fileNames: ['Detail.safetensors']
    })
    expect(catalog.searchModels).toHaveBeenCalledWith({
      kind: ModelKind.Lora,
      text: 'detail',
      limit: 12
    })
  })

  it('matches nothing by file name without an identity, and caps the list', async () => {
    catalog.searchModels.mockResolvedValue({
      nextCursor: null,
      models: Array.from({ length: 12 }, (_, n) =>
        civitaiModel(n + 1, [
          version(n * 10 + 1),
          version(n * 10 + 2),
          version(n * 10 + 3),
          version(n * 10 + 4)
        ])
      )
    })
    const found = await service.search({ kind: ModelKind.Lora, text: 'x' })
    expect(found).toHaveLength(40)
    expect(found.some((candidate) => candidate.matchesFileName)).toBe(false)
  })
})
