import { describe, expect, it } from 'vitest'
import type { ImageId } from '@domain/library'
import { SqliteTagRepository } from '@infrastructure/db/repositories/sqlite-tag-repository'
import { searchLibrary } from '@infrastructure/db/testing/search-library'
import { ChangeOutcome } from '@shared/tags'
import { TagService } from './tag-service'

function service(): TagService {
  return new TagService(new SqliteTagRepository(searchLibrary().db), () => 42)
}

describe('TagService', () => {
  it('reports duplicates and missing tags as outcomes', () => {
    const tags = service()
    const created = tags.create('Red')
    expect(created).toMatchObject({ outcome: ChangeOutcome.Done, tag: { name: 'Red' } })
    const id = created.outcome === ChangeOutcome.Done ? created.tag.id : 0
    expect(tags.create('red')).toMatchObject({ outcome: ChangeOutcome.Duplicate, existing: { id } })
    tags.create('blue')
    expect(tags.rename(id, 'Blue')).toMatchObject({ outcome: ChangeOutcome.Duplicate })
    expect(tags.rename(999, 'green')).toEqual({ outcome: ChangeOutcome.Missing })
    expect(tags.merge(999, id)).toEqual({ outcome: ChangeOutcome.Missing })
  })

  it('applies and removes by id lists', () => {
    const tags = service()
    const red = tags.create('red')
    const id = red.outcome === ChangeOutcome.Done ? red.tag.id : 0
    expect(tags.apply([id], [1 as ImageId, 2 as ImageId])).toBe(2)
    expect(tags.tagsOf(1 as ImageId).map((tag) => tag.name)).toEqual(['red'])
    expect(tags.remove([id], [1 as ImageId])).toBe(1)
    expect(tags.list()).toEqual([{ id, name: 'red', imageCount: 1 }])
  })
})
