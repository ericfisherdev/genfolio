import { beforeEach, describe, expect, it } from 'vitest'
import type { ImageId } from '@domain/library'
import { DuplicateTagError, UnknownTagError } from '@domain/repositories'
import { searchLibrary, type SearchLibrary } from '../testing/search-library'
import { SqliteTagRepository } from './sqlite-tag-repository'

let library: SearchLibrary
let tags: SqliteTagRepository
const image = (n: number): ImageId => library.ids.get(n) ?? (0 as ImageId)
const names = (records: readonly { name: string; imageCount: number }[]): [string, number][] =>
  records.map((tag) => [tag.name, tag.imageCount])

beforeEach(() => {
  library = searchLibrary()
  tags = new SqliteTagRepository(library.db)
})

describe('SqliteTagRepository', () => {
  it('creates tags and rejects a name that folds to an existing one', () => {
    const elan = tags.create('Élan', 1)
    expect(elan).toMatchObject({ name: 'Élan', imageCount: 0 })
    expect(() => tags.create('élan', 1)).toThrow(DuplicateTagError)
    try {
      tags.create('ÉLAN', 1)
    } catch (error) {
      expect((error as DuplicateTagError).existing.id).toBe(elan.id)
    }
  })

  it('applies to many images at once, ignores repeats and unknown ids, and removes', () => {
    const red = tags.create('red', 1)
    const blue = tags.create('blue', 1)
    expect(tags.apply([red.id, blue.id], [image(1), image(2), 999_999 as ImageId])).toBe(4)
    expect(tags.apply([red.id], [image(1)])).toBe(0)
    expect(tags.apply([999], [image(1)])).toBe(0)
    expect(names(tags.list())).toEqual([
      ['blue', 2],
      ['red', 2]
    ])
    expect(names(tags.tagsOf(image(1)))).toEqual([
      ['blue', 2],
      ['red', 2]
    ])
    expect(tags.remove([blue.id], [image(1)])).toBe(1)
    expect(names(tags.tagsOf(image(1)))).toEqual([['red', 2]])
  })

  it('renames, allowing a new spelling of the same name but not another tag’s name', () => {
    const red = tags.create('red', 1)
    tags.create('blue', 1)
    expect(tags.rename(red.id, 'Red').name).toBe('Red')
    expect(() => tags.rename(red.id, 'BLUE')).toThrow(DuplicateTagError)
    expect(() => tags.rename(999, 'green')).toThrow(UnknownTagError)
  })

  it('merges one tag into another without duplicating links', () => {
    const red = tags.create('red', 1)
    const crimson = tags.create('crimson', 1)
    tags.apply([red.id], [image(1), image(2)])
    tags.apply([crimson.id], [image(2), image(3)])
    const merged = tags.merge(crimson.id, red.id)
    expect(merged).toMatchObject({ id: red.id, imageCount: 3 })
    expect(names(tags.list())).toEqual([['red', 3]])
    expect(() => tags.merge(crimson.id, red.id)).toThrow(UnknownTagError)
  })

  it('deletes a tag and its links, and finds tags by folded name', () => {
    const red = tags.create('Red', 1)
    tags.apply([red.id], [image(1)])
    expect(tags.findByName('  red ')?.id).toBe(red.id)
    expect(tags.delete(red.id)).toBe(true)
    expect(tags.delete(red.id)).toBe(false)
    expect(tags.tagsOf(image(1))).toEqual([])
    expect(library.db.prepare('SELECT COUNT(*) FROM image_tags').pluck().get()).toBe(0)
  })
})
