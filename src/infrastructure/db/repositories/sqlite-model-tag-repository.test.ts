import { beforeEach, describe, expect, it } from 'vitest'
import { DuplicateModelTagError, UnknownModelTagError } from '@domain/repositories'
import { ModelKind } from '@shared/generation-kinds'
import { EMPTY_MODEL_FIELDS, type ModelKey } from '@shared/models'
import { searchLibrary } from '../testing/search-library'
import { SqliteModelInfoRepository } from './sqlite-model-info-repository'
import { SqliteModelTagRepository } from './sqlite-model-tag-repository'
import { SqliteTagRepository } from './sqlite-tag-repository'

let db: ReturnType<typeof searchLibrary>['db']
let tags: SqliteModelTagRepository
let info: SqliteModelInfoRepository

const lora = (identity: string): ModelKey => ({ kind: ModelKind.Lora, identity })
const checkpoint = (identity: string): ModelKey => ({ kind: ModelKind.Checkpoint, identity })
const names = (records: readonly { name: string; modelCount: number }[]): [string, number][] =>
  records.map((tag) => [tag.name, tag.modelCount])
const linkCount = (): unknown => db.prepare('SELECT COUNT(*) FROM model_tag_links').pluck().get()

beforeEach(() => {
  db = searchLibrary().db
  tags = new SqliteModelTagRepository(db)
  info = new SqliteModelInfoRepository(db)
})

describe('SqliteModelTagRepository', () => {
  it('creates tags and rejects a name that folds to an existing one', () => {
    const lighting = tags.create('Lighting', 1)
    expect(lighting).toMatchObject({ name: 'Lighting', modelCount: 0 })
    expect(() => tags.create('lighting', 1)).toThrow(DuplicateModelTagError)
    try {
      tags.create('LIGHTING', 1)
    } catch (error) {
      expect((error as DuplicateModelTagError).existing.id).toBe(lighting.id)
    }
  })

  it('folds accents and case when comparing names', () => {
    tags.create('Élan', 1)
    expect(() => tags.create('élan', 1)).toThrow(DuplicateModelTagError)
  })

  it('renames, allowing a new spelling of the same name but not another tag’s name', () => {
    const lighting = tags.create('lighting', 1)
    tags.create('disney', 1)
    expect(tags.rename(lighting.id, 'Lighting').name).toBe('Lighting')
    expect(() => tags.rename(lighting.id, 'DISNEY')).toThrow(DuplicateModelTagError)
    expect(() => tags.rename(999, 'green')).toThrow(UnknownModelTagError)
  })

  it('applies a tag to a listed model and counts the models carrying it', () => {
    const lighting = tags.create('lighting', 1)
    const disney = tags.create('disney', 1)
    expect(tags.apply(lighting.id, lora('detail'), 2)).toBe(true)
    expect(tags.apply(lighting.id, lora('style'), 2)).toBe(true)
    expect(tags.apply(disney.id, lora('detail'), 2)).toBe(true)
    expect(names(tags.list())).toEqual([
      ['disney', 1],
      ['lighting', 2]
    ])
    expect(names(tags.tagsOf(lora('detail')))).toEqual([
      ['disney', 1],
      ['lighting', 2]
    ])
    expect(tags.tagsOf(lora('style')).map((tag) => tag.name)).toEqual(['lighting'])
    expect(tags.tagsOf(lora('missing'))).toEqual([])
  })

  it('tags a checkpoint and a LoRA of the same identity separately', () => {
    const lighting = tags.create('lighting', 1)
    tags.apply(lighting.id, lora('detail'), 2)
    expect(tags.tagsOf(checkpoint('detail'))).toEqual([])
    expect(tags.remove(lighting.id, checkpoint('detail'))).toBe(false)
  })

  it('applies a tag the model already carries without error or a second link', () => {
    const lighting = tags.create('lighting', 1)
    expect(tags.apply(lighting.id, lora('detail'), 2)).toBe(true)
    expect(tags.apply(lighting.id, lora('detail'), 3)).toBe(true)
    expect(linkCount()).toBe(1)
  })

  it('returns false for a model that is not listed, and throws for a tag that is gone', () => {
    const lighting = tags.create('lighting', 1)
    expect(tags.apply(lighting.id, lora('unknown'), 2)).toBe(false)
    expect(tags.apply(lighting.id, checkpoint('detail'), 2)).toBe(false)
    expect(linkCount()).toBe(0)
    expect(() => tags.apply(999, lora('detail'), 2)).toThrow(UnknownModelTagError)
  })

  it('tags a model added by hand', () => {
    const lighting = tags.create('lighting', 1)
    info.create(lora('ghost'), 'Ghost', EMPTY_MODEL_FIELDS, 1)
    expect(tags.apply(lighting.id, lora('ghost'), 2)).toBe(true)
    expect(names(tags.list())).toEqual([['lighting', 1]])
  })

  it('removes a link and reports whether there was one', () => {
    const lighting = tags.create('lighting', 1)
    tags.apply(lighting.id, lora('detail'), 2)
    expect(tags.remove(lighting.id, lora('detail'))).toBe(true)
    expect(tags.remove(lighting.id, lora('detail'))).toBe(false)
    expect(names(tags.list())).toEqual([['lighting', 0]])
  })

  it('deletes a tag with its links', () => {
    const lighting = tags.create('lighting', 1)
    tags.apply(lighting.id, lora('detail'), 2)
    expect(tags.delete(lighting.id)).toBe(true)
    expect(tags.delete(lighting.id)).toBe(false)
    expect(tags.tagsOf(lora('detail'))).toEqual([])
    expect(linkCount()).toBe(0)
  })

  it('keeps a link after every model row is gone, and shows it when the model returns', () => {
    const lighting = tags.create('lighting', 1)
    tags.apply(lighting.id, lora('detail'), 2)
    db.exec('DELETE FROM generations; DELETE FROM models')
    expect(linkCount()).toBe(1)
    // The model is no longer listed, so it is not counted.
    expect(names(tags.list())).toEqual([['lighting', 0]])

    db.exec("INSERT INTO models (kind, identity, display_name) VALUES ('lora', 'detail', 'detail')")

    expect(names(tags.list())).toEqual([['lighting', 1]])
    expect(tags.tagsOf(lora('detail')).map((tag) => tag.name)).toEqual(['lighting'])
  })

  it('shares nothing with image tags', () => {
    const imageTags = new SqliteTagRepository(db)
    tags.create('lighting', 1)
    imageTags.create('portrait', 1)
    expect(imageTags.list().map((tag) => tag.name)).toEqual(['portrait'])
    expect(tags.list().map((tag) => tag.name)).toEqual(['lighting'])
    // The same name may exist in both vocabularies.
    expect(() => imageTags.create('lighting', 1)).not.toThrow()
  })
})
