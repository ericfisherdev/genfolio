import { beforeEach, describe, expect, it } from 'vitest'
import { ModelKind } from '@shared/generation-kinds'
import type { CivitaiRecord } from '@shared/model-civitai'
import type { ModelFields, ModelListQuery } from '@shared/models'
import { searchLibrary } from '../testing/search-library'
import { SqliteModelCivitaiRepository } from './sqlite-model-civitai-repository'
import { SqliteModelInfoRepository } from './sqlite-model-info-repository'

let db: ReturnType<typeof searchLibrary>['db']
let civitai: SqliteModelCivitaiRepository
let models: SqliteModelInfoRepository

beforeEach(() => {
  db = searchLibrary().db
  civitai = new SqliteModelCivitaiRepository(db)
  models = new SqliteModelInfoRepository(db)
})

const key = { kind: ModelKind.Lora, identity: 'detail' }
const record: CivitaiRecord = {
  modelId: 122359,
  versionId: 135867,
  modelName: 'Detail Tweaker XL',
  versionName: 'v1.0',
  baseModel: 'SDXL 1.0',
  triggerWords: ['add detail', 'sharp'],
  description: 'Detail tweaker for SDXL.',
  versionDescription: 'First release',
  creator: 'w4r10ck',
  nsfw: false,
  tags: ['concept', 'detail'],
  downloads: 455250,
  thumbsUp: 43677,
  publishedAt: '2023-08-07T14:55:02.627Z'
}
const mine: ModelFields = {
  baseModel: null,
  triggerWords: ['Sharp', 'mine'],
  strength: 0.8,
  description: null,
  notes: 'keep low'
}
const PAGE: ModelListQuery = { offset: 0, limit: 50 }
const names = (query: Partial<ModelListQuery>): string[] =>
  models.list({ ...PAGE, ...query }).items.map((item) => item.name)

describe('SqliteModelCivitaiRepository', () => {
  it('links a library model and shows what Civitai said', () => {
    civitai.save(key, record, 99)
    expect(civitai.linkOf(key)).toEqual({ modelId: 122359, versionId: 135867 })
    expect(models.find(key)).toMatchObject({
      hasInfo: true,
      baseModel: 'SDXL 1.0',
      triggerWords: ['add detail', 'sharp'],
      custom: { baseModel: null, triggerWords: [], notes: null },
      civitai: { ...record, fetchedAt: 99 }
    })
  })

  it('replaces the link, and what was fetched with it', () => {
    civitai.save(key, record, 1)
    civitai.save(key, { ...record, versionId: 7, baseModel: 'Pony', triggerWords: [] }, 2)
    expect(db.prepare('SELECT COUNT(*) FROM model_civitai').pluck().get()).toBe(1)
    expect(models.find(key)).toMatchObject({
      baseModel: 'Pony',
      civitai: { versionId: 7, fetchedAt: 2 }
    })
  })

  it("lets the user's base model win and lists their trigger words first, without repeats", () => {
    civitai.save(key, record, 1)
    models.save(key, { ...mine, baseModel: 'My base' }, 2)
    expect(models.find(key)).toMatchObject({
      baseModel: 'My base',
      triggerWords: ['Sharp', 'mine', 'add detail'],
      strength: 0.8,
      custom: { baseModel: 'My base', triggerWords: ['Sharp', 'mine'] },
      civitai: { baseModel: 'SDXL 1.0' }
    })
  })

  it('keeps what the user wrote when the link is refreshed or removed', () => {
    models.save(key, mine, 1)
    civitai.save(key, record, 2)
    civitai.save(key, { ...record, baseModel: 'Pony' }, 3)
    expect(models.find(key)?.custom).toEqual(mine)
    expect(civitai.remove(key)).toBe(true)
    expect(civitai.remove(key)).toBe(false)
    expect(models.find(key)).toMatchObject({ custom: mine, civitai: null, baseModel: null })
  })

  it('counts a linked model as having info, and searches what Civitai said', () => {
    expect(names({ withoutInfo: true })).toEqual(['alpha', 'beta', 'detail', 'style'])
    civitai.save(key, record, 1)
    expect(names({ withoutInfo: true })).toEqual(['alpha', 'beta', 'style'])
    expect(names({ text: 'tweaker for sdxl' })).toEqual(['detail'])
    expect(names({ text: 'first release' })).toEqual(['detail'])
    expect(names({ text: 'add detail' })).toEqual(['detail'])
    expect(names({ baseModel: 'sdxl 1.0' })).toEqual(['detail'])
  })

  it("offers the base models in use, the user's overriding Civitai's", () => {
    civitai.save(key, record, 1)
    civitai.save({ kind: ModelKind.Lora, identity: 'style' }, { ...record, baseModel: 'Pony' }, 1)
    models.save({ kind: ModelKind.Lora, identity: 'style' }, { ...mine, baseModel: 'SD 1.5' }, 2)
    expect(models.list(PAGE).baseModels).toEqual(['SD 1.5', 'SDXL 1.0'])
  })

  it('lists the hashes seen for a model, longest first', () => {
    const lora = db.prepare("SELECT id FROM models WHERE identity = 'detail'").pluck().get()
    for (const hash of ['0d9bd1b873', '0d9bd1b873a7', '29a40d2e']) {
      db.prepare('INSERT INTO model_hashes (model_id, hash, hash_kind) VALUES (?, ?, ?)').run(
        lora,
        hash,
        'x'
      )
    }
    expect(civitai.hashesOf(key)).toEqual(['0d9bd1b873a7', '0d9bd1b873', '29a40d2e'])
    expect(civitai.hashesOf({ kind: ModelKind.Lora, identity: 'ghost' })).toEqual([])
  })

  it('refuses a malformed words list', () => {
    civitai.save(key, record, 1)
    expect(() => db.exec("UPDATE model_civitai SET tags_json = '{}'")).toThrow(/CHECK/)
  })
})
