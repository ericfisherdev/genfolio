import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CivitaiCatalog, CivitaiFile, CivitaiModel, CivitaiVersion } from '@domain/civitai'
import { CivitaiUnavailableError } from '@domain/civitai'
import { ModelKind } from '@shared/generation-kinds'
import { CivitaiBrowseService } from './civitai-browse-service'

const SHA = 'a'.repeat(64)

const file = (name: string, fields: Partial<CivitaiFile> = {}): CivitaiFile => ({
  name,
  sizeKb: 2048,
  type: 'Model',
  primary: true,
  downloadUrl: 'https://civitai.com/api/download/models/9',
  hashes: { SHA256: SHA.toUpperCase() },
  ...fields
})

const version = (
  id: number,
  files: CivitaiFile[],
  fields: Partial<CivitaiVersion> = {}
): CivitaiVersion => ({
  id,
  name: `v${id}`,
  baseModel: 'SDXL 1.0',
  trainedWords: ['add detail'],
  description: null,
  publishedAt: '2023-08-07T14:55:02.627Z',
  files,
  ...fields
})

const model = (id: number, versions: CivitaiVersion[]): CivitaiModel => ({
  id,
  name: `model ${id}`,
  type: 'LORA',
  description: null,
  creator: 'someone',
  nsfw: false,
  tags: ['detail'],
  downloads: 10,
  thumbsUp: 2,
  versions
})

let catalog: { [M in keyof CivitaiCatalog]: ReturnType<typeof vi.fn> }
let service: CivitaiBrowseService

beforeEach(() => {
  catalog = { versionByHash: vi.fn(), model: vi.fn(), searchModels: vi.fn() }
  service = new CivitaiBrowseService(catalog as unknown as CivitaiCatalog)
})

describe('CivitaiBrowseService.browse', () => {
  it('lists models with the file each version would download', async () => {
    catalog.searchModels.mockResolvedValue({
      nextCursor: '20',
      models: [model(1, [version(9, [file('add-detail-xl.safetensors')]), version(8, [])])]
    })
    const page = await service.browse({
      kind: ModelKind.Lora,
      text: 'detail',
      baseModel: 'SDXL 1.0'
    })
    expect(catalog.searchModels).toHaveBeenCalledWith({
      kind: ModelKind.Lora,
      text: 'detail',
      baseModel: 'SDXL 1.0',
      limit: 20
    })
    expect(page.nextCursor).toBe('20')
    expect(page.items[0]).toMatchObject({
      modelId: 1,
      name: 'model 1',
      creator: 'someone',
      versions: [
        {
          versionId: 9,
          fileName: 'add-detail-xl.safetensors',
          sizeKb: 2048,
          baseModel: 'SDXL 1.0'
        },
        { versionId: 8, fileName: null, sizeKb: null }
      ]
    })
  })

  it('passes a cursor on and sends no empty filters', async () => {
    catalog.searchModels.mockResolvedValue({ nextCursor: null, models: [] })
    await service.browse({ kind: ModelKind.Checkpoint, cursor: '40' })
    expect(catalog.searchModels).toHaveBeenCalledWith({
      kind: ModelKind.Checkpoint,
      cursor: '40',
      limit: 20
    })
  })

  it('leaves out a model with nothing to download', async () => {
    catalog.searchModels.mockResolvedValue({
      nextCursor: null,
      models: [
        model(1, [version(1, [file('readme.zip')])]),
        model(2, [version(2, [file('ok.safetensors')])]),
        model(3, [])
      ]
    })
    const page = await service.browse({ kind: ModelKind.Lora })
    expect(page.items.map((item) => item.modelId)).toEqual([2])
  })

  it('lets a Civitai failure through', async () => {
    catalog.searchModels.mockRejectedValue(new CivitaiUnavailableError('Could not reach Civitai'))
    await expect(service.browse({ kind: ModelKind.Lora })).rejects.toBeInstanceOf(
      CivitaiUnavailableError
    )
  })
})

describe('CivitaiBrowseService.planDownload', () => {
  it('names the file, its hash, base model and Civitai address', async () => {
    catalog.model.mockResolvedValue(model(1, [version(9, [file('../x/Add Detail.safetensors')])]))
    await expect(service.planDownload(1, 9)).resolves.toEqual({
      fileName: 'Add Detail.safetensors',
      sizeKb: 2048,
      sha256: SHA,
      downloadUrl: 'https://civitai.com/api/download/models/9',
      baseModel: 'SDXL 1.0',
      modelName: 'model 1',
      versionName: 'v9'
    })
  })

  it("uses Civitai's own address when the reply names another host", async () => {
    catalog.model.mockResolvedValue(
      model(1, [
        version(9, [file('a.safetensors', { downloadUrl: 'https://evil.example/a.safetensors' })])
      ])
    )
    expect((await service.planDownload(1, 9))?.downloadUrl).toBe(
      'https://civitai.com/api/download/models/9'
    )
    catalog.model.mockResolvedValue(
      model(1, [
        version(9, [
          file('a.safetensors', { downloadUrl: 'http://civitai.com/api/download/models/9' })
        ])
      ])
    )
    expect((await service.planDownload(1, 9))?.downloadUrl).toBe(
      'https://civitai.com/api/download/models/9'
    )
    catalog.model.mockResolvedValue(
      model(1, [
        version(9, [file('a.safetensors', { downloadUrl: 'https://civitai.com.evil.example/x' })])
      ])
    )
    expect((await service.planDownload(1, 9))?.downloadUrl).toBe(
      'https://civitai.com/api/download/models/9'
    )
  })

  it('has no hash when Civitai gives none or one that is not SHA-256', async () => {
    catalog.model.mockResolvedValue(model(1, [version(9, [file('a.safetensors', { hashes: {} })])]))
    expect((await service.planDownload(1, 9))?.sha256).toBeNull()
    catalog.model.mockResolvedValue(
      model(1, [version(9, [file('a.safetensors', { hashes: { SHA256: 'xyz' } })])])
    )
    expect((await service.planDownload(1, 9))?.sha256).toBeNull()
  })

  it.each([
    ['no such model', () => null],
    ['no such version', () => model(1, [version(8, [file('a.safetensors')])])],
    ['no model file', () => model(1, [version(9, [file('a.zip')])])]
  ])('is null for %s', async (_name, reply) => {
    catalog.model.mockResolvedValue(reply())
    await expect(service.planDownload(1, 9)).resolves.toBeNull()
  })
})
