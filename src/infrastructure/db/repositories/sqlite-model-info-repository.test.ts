import { beforeEach, describe, expect, it } from 'vitest'
import { ModelKind } from '@shared/generation-kinds'
import { EMPTY_MODEL_FIELDS, type ModelFields, type ModelListQuery } from '@shared/models'
import { searchLibrary } from '../testing/search-library'
import { SqliteModelInfoRepository } from './sqlite-model-info-repository'

let models: SqliteModelInfoRepository
let db: ReturnType<typeof searchLibrary>['db']

beforeEach(() => {
  db = searchLibrary().db
  models = new SqliteModelInfoRepository(db)
})

const PAGE: ModelListQuery = { offset: 0, limit: 50 }
const detail: ModelFields = {
  baseModel: 'SDXL 1.0',
  triggerWords: ['add detail', 'sharp'],
  strength: 0.8,
  description: 'Adds fine detail.',
  notes: 'Works best below 1.0'
}
const lora = (identity: string): { kind: ModelKind; identity: string } => ({
  kind: ModelKind.Lora,
  identity
})
const names = (query: Partial<ModelListQuery>): string[] =>
  models.list({ ...PAGE, ...query }).items.map((item) => item.name)

describe('SqliteModelInfoRepository', () => {
  it('lists the models the images use with how many images use each', () => {
    const { items, total } = models.list(PAGE)
    expect(total).toBe(4)
    expect(
      items.map(({ kind, name, imageCount, hasInfo }) => [kind, name, imageCount, hasInfo])
    ).toEqual([
      ['checkpoint', 'alpha', 3, false],
      ['checkpoint', 'beta', 3, false],
      ['lora', 'detail', 2, false],
      ['lora', 'style', 2, false]
    ])
  })

  it('records fields for a library model and reads them back', () => {
    expect(models.save(lora('detail'), detail, 5)).toBe(true)
    expect(models.find(lora('detail'))).toMatchObject({
      name: 'detail',
      imageCount: 2,
      hasInfo: true,
      ...detail
    })
    expect(models.save(lora('detail'), { ...detail, baseModel: 'Pony' }, 6)).toBe(true)
    expect(models.find(lora('detail'))?.baseModel).toBe('Pony')
    expect(db.prepare('SELECT COUNT(*) FROM model_info').pluck().get()).toBe(1)
  })

  it('refuses to save a model nothing knows', () => {
    expect(models.save(lora('ghost'), detail, 5)).toBe(false)
  })

  it('adds a model by hand, once, and lists it with no images', () => {
    expect(models.create(lora('ghost'), 'Ghost', detail, 5)).toBe(true)
    expect(models.create(lora('ghost'), 'Ghost again', EMPTY_MODEL_FIELDS, 6)).toBe(false)
    expect(models.find(lora('ghost'))).toMatchObject({
      name: 'Ghost',
      imageCount: 0,
      hasInfo: true
    })
    expect(models.save(lora('ghost'), { ...detail, strength: 1 }, 7)).toBe(true)
    expect(models.find(lora('ghost'))?.strength).toBe(1)
  })

  it('lists a hand-added model that the images use once, under the library name', () => {
    models.create(lora('detail'), 'Detail (mine)', detail, 5)
    expect(names({ kind: ModelKind.Lora })).toEqual(['detail', 'style'])
    expect(models.find(lora('detail'))).toMatchObject({ name: 'detail', hasInfo: true })
  })

  it('clears an entry: a library model stays listed, a hand-added one goes', () => {
    models.save(lora('detail'), detail, 5)
    models.create(lora('ghost'), 'Ghost', detail, 5)
    expect(models.clear(lora('detail'))).toBe(true)
    expect(models.clear(lora('detail'))).toBe(false)
    expect(models.clear(lora('ghost'))).toBe(true)
    expect(models.find(lora('detail'))).toMatchObject({ hasInfo: false, triggerWords: [] })
    expect(models.find(lora('ghost'))).toBeUndefined()
  })

  it('keeps an entry after the images that used the model are gone', () => {
    models.save(lora('detail'), detail, 5)
    db.exec('DELETE FROM generations; DELETE FROM models')
    expect(models.find(lora('detail'))).toMatchObject({
      imageCount: 0,
      triggerWords: detail.triggerWords
    })
  })

  it('filters by kind, base model and models without info', () => {
    models.save(lora('detail'), detail, 5)
    models.save(lora('style'), { ...detail, baseModel: 'pony' }, 5)
    expect(names({ kind: ModelKind.Checkpoint })).toEqual(['alpha', 'beta'])
    expect(names({ baseModel: 'sdxl 1.0' })).toEqual(['detail'])
    expect(names({ withoutInfo: true })).toEqual(['alpha', 'beta'])
  })

  it('searches the name, base model, trigger words, description and notes, ignoring case', () => {
    models.save(lora('detail'), detail, 5)
    expect(names({ text: 'ALPH' })).toEqual(['alpha'])
    expect(names({ text: 'sdxl' })).toEqual(['detail'])
    expect(names({ text: 'add detail' })).toEqual(['detail'])
    expect(names({ text: 'fine' })).toEqual(['detail'])
    expect(names({ text: 'below 1.0' })).toEqual(['detail'])
    expect(names({ text: '   ' })).toHaveLength(4)
    expect(names({ text: 'zzz' })).toEqual([])
  })

  it('treats LIKE wildcards in the search as plain text', () => {
    expect(names({ text: '%' })).toEqual([])
    expect(names({ text: '_' })).toEqual([])
  })

  it('pages the list and reports the total and the base models recorded', () => {
    models.save(lora('detail'), detail, 5)
    models.save(lora('style'), { ...detail, baseModel: 'sdxl 1.0' }, 5)
    models.create(lora('ghost'), 'Ghost', { ...detail, baseModel: 'Pony' }, 5)
    const page = models.list({ offset: 2, limit: 2 })
    expect(page.total).toBe(5)
    expect(page.items.map((item) => item.name)).toEqual(['detail', 'Ghost'])
    expect(page.baseModels).toEqual(['Pony', 'SDXL 1.0'])
  })

  it('rejects a trigger word list that is not an array', () => {
    models.save(lora('detail'), detail, 5)
    expect(() =>
      db.exec("UPDATE model_info SET trigger_words_json = '{}' WHERE identity = 'detail'")
    ).toThrow(/CHECK/)
  })
})
