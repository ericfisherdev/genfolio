import { beforeEach, describe, expect, it } from 'vitest'
import { ModelKind } from '@shared/generation-kinds'
import { EMPTY_MODEL_FIELDS, type ModelFields, type ModelListQuery } from '@shared/models'
import { searchLibrary } from '../testing/search-library'
import { SqliteModelInfoRepository } from './sqlite-model-info-repository'
import { SqliteModelTagRepository } from './sqlite-model-tag-repository'

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
      baseModel: 'SDXL 1.0',
      triggerWords: ['add detail', 'sharp'],
      strength: 0.8,
      custom: detail,
      civitai: null
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

  it('clears the tags of a hand-added model with its entry, and keeps a library model’s', () => {
    const tags = new SqliteModelTagRepository(db)
    const lighting = tags.create('lighting', 1)
    models.save(lora('detail'), detail, 5)
    models.create(lora('ghost'), 'Ghost', detail, 5)
    tags.apply(lighting.id, lora('detail'), 6)
    tags.apply(lighting.id, lora('ghost'), 6)

    models.clear(lora('detail'))
    expect(tags.tagsOf(lora('detail')).map((tag) => tag.name)).toEqual(['lighting'])
    models.clear(lora('ghost'))
    expect(tags.tagsOf(lora('ghost'))).toEqual([])
    expect(tags.list()).toEqual([{ id: lighting.id, name: 'lighting', modelCount: 1 }])
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

  it('finds non-ASCII text whatever the case it was typed in', () => {
    models.save(lora('detail'), { ...detail, notes: 'Über detail, très Élan' }, 5)
    expect(names({ text: 'ÜBER' })).toEqual(['detail'])
    expect(names({ text: 'über' })).toEqual(['detail'])
    expect(names({ text: 'élan' })).toEqual(['detail'])
  })

  it('searches the trigger words themselves, not the JSON that stores them', () => {
    models.save(lora('detail'), { ...detail, triggerWords: ['add detail', 'say "hi"'] }, 5)
    expect(names({ text: '[' })).toEqual([])
    expect(names({ text: ',' })).toEqual([])
    expect(names({ text: 'detail", "' })).toEqual([])
    expect(names({ text: 'say "hi"' })).toEqual(['detail'])
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

  describe('model tags', () => {
    let tags: SqliteModelTagRepository
    beforeEach(() => {
      tags = new SqliteModelTagRepository(db)
    })
    const tagNames = (query: Partial<ModelListQuery>): Record<string, string[]> =>
      Object.fromEntries(
        models
          .list({ ...PAGE, ...query })
          .items.map((item) => [item.name, item.tags.map((tag) => tag.name)])
      )

    it('lists each model with its tags in name order, and none as an empty list', () => {
      const lighting = tags.create('Lighting', 1)
      const anime = tags.create('anime', 1)
      tags.apply(lighting.id, lora('detail'), 2)
      tags.apply(anime.id, lora('detail'), 2)
      tags.apply(anime.id, lora('style'), 2)
      expect(tagNames({ kind: ModelKind.Lora })).toEqual({
        detail: ['anime', 'Lighting'],
        style: ['anime']
      })
      expect(tagNames({ kind: ModelKind.Checkpoint })).toEqual({ alpha: [], beta: [] })
      expect(models.find(lora('detail'))?.tags).toEqual([
        { id: anime.id, name: 'anime' },
        { id: lighting.id, name: 'Lighting' }
      ])
    })

    it('does not mix a checkpoint and a LoRA that share an identity', () => {
      const tag = tags.create('shared', 1)
      db.prepare(
        "INSERT INTO models (kind, identity, display_name) VALUES ('checkpoint', 'detail', 'detail')"
      ).run()
      tags.apply(tag.id, lora('detail'), 2)
      expect(models.find({ kind: ModelKind.Checkpoint, identity: 'detail' })?.tags).toEqual([])
    })

    it('narrows the list and its total to the models carrying a tag', () => {
      const lighting = tags.create('lighting', 1)
      tags.create('unused', 1)
      tags.apply(lighting.id, lora('detail'), 2)
      tags.apply(lighting.id, { kind: ModelKind.Checkpoint, identity: 'alpha' }, 2)
      const page = models.list({ ...PAGE, modelTagId: lighting.id })
      expect(page.total).toBe(2)
      expect(page.items.map((item) => item.name)).toEqual(['alpha', 'detail'])
      expect(models.list({ ...PAGE, modelTagId: lighting.id, kind: ModelKind.Lora }).total).toBe(1)
      expect(models.list({ ...PAGE, modelTagId: lighting.id + 100 }).total).toBe(0)
    })

    it('shows every tag of a model that a tag filter selects', () => {
      const lighting = tags.create('lighting', 1)
      const anime = tags.create('anime', 1)
      tags.apply(lighting.id, lora('detail'), 2)
      tags.apply(anime.id, lora('detail'), 2)
      expect(tagNames({ modelTagId: lighting.id })).toEqual({ detail: ['anime', 'lighting'] })
    })
  })

  it('rejects a trigger word list that is not an array', () => {
    models.save(lora('detail'), detail, 5)
    expect(() =>
      db.exec("UPDATE model_info SET trigger_words_json = '{}' WHERE identity = 'detail'")
    ).toThrow(/CHECK/)
  })
})
