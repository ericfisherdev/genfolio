import { describe, expect, it } from 'vitest'
import { SqliteModelTagRepository } from '@infrastructure/db/repositories/sqlite-model-tag-repository'
import { SqliteTagRepository } from '@infrastructure/db/repositories/sqlite-tag-repository'
import { searchLibrary } from '@infrastructure/db/testing/search-library'
import { ModelKind } from '@shared/generation-kinds'
import { ChangeOutcome } from '@shared/model-tags'
import { ModelTagService } from './model-tag-service'
import { TagService } from './tag-service'

const detail = { kind: ModelKind.Lora, identity: 'detail' }

function setup(): { modelTags: ModelTagService; imageTags: TagService } {
  const { db } = searchLibrary()
  return {
    modelTags: new ModelTagService(new SqliteModelTagRepository(db), () => 42),
    imageTags: new TagService(new SqliteTagRepository(db), () => 42)
  }
}

describe('ModelTagService', () => {
  it('reports duplicates and missing tags as outcomes', () => {
    const { modelTags } = setup()
    const created = modelTags.create('Lighting')
    expect(created).toMatchObject({ outcome: ChangeOutcome.Done, tag: { name: 'Lighting' } })
    const id = created.outcome === ChangeOutcome.Done ? created.tag.id : 0
    expect(modelTags.create('lighting')).toMatchObject({
      outcome: ChangeOutcome.Duplicate,
      existing: { id }
    })
    modelTags.create('disney')
    expect(modelTags.rename(id, 'Disney')).toMatchObject({ outcome: ChangeOutcome.Duplicate })
    expect(modelTags.rename(999, 'green')).toEqual({ outcome: ChangeOutcome.Missing })
  })

  it('applies and removes a tag on a model', () => {
    const { modelTags } = setup()
    const created = modelTags.create('lighting')
    const id = created.outcome === ChangeOutcome.Done ? created.tag.id : 0
    expect(modelTags.apply(id, detail)).toBe(true)
    expect(modelTags.tagsOf(detail)).toEqual([{ id, name: 'lighting', modelCount: 1 }])
    expect(modelTags.remove(id, detail)).toBe(true)
    expect(modelTags.tagsOf(detail)).toEqual([])
  })

  it('applies nothing to an unknown model or from a deleted tag', () => {
    const { modelTags } = setup()
    const created = modelTags.create('lighting')
    const id = created.outcome === ChangeOutcome.Done ? created.tag.id : 0
    expect(modelTags.apply(id, { kind: ModelKind.Lora, identity: 'unknown' })).toBe(false)
    expect(modelTags.apply(999, detail)).toBe(false)
    expect(modelTags.delete(id)).toBe(true)
    expect(modelTags.delete(id)).toBe(false)
    expect(modelTags.apply(id, detail)).toBe(false)
  })

  it('keeps model tags out of the image tag list', () => {
    const { modelTags, imageTags } = setup()
    modelTags.create('lighting')
    expect(imageTags.list()).toEqual([])
    imageTags.create('portrait')
    expect(modelTags.list().map((tag) => tag.name)).toEqual(['lighting'])
  })
})
