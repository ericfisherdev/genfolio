import { describe, expect, it } from 'vitest'
import { SqliteModelInfoRepository } from '@infrastructure/db/repositories/sqlite-model-info-repository'
import { searchLibrary } from '@infrastructure/db/testing/search-library'
import { ModelKind } from '@shared/generation-kinds'
import { ChangeOutcome, EMPTY_MODEL_FIELDS } from '@shared/models'
import { ModelInfoService } from './model-info-service'

const service = (): ModelInfoService =>
  new ModelInfoService(new SqliteModelInfoRepository(searchLibrary().db), () => 42)

const key = { kind: ModelKind.Lora, identity: 'detail' }

describe('ModelInfoService', () => {
  it('cleans the fields it stores: trimmed, empties dropped, repeated words removed', () => {
    const models = service()
    const saved = models.save(key, {
      baseModel: '  SDXL 1.0 ',
      triggerWords: [' add detail', 'Add Detail', '', 'sharp '],
      strength: 0.8,
      description: '   ',
      notes: ' keep low '
    })
    expect(saved).toMatchObject({
      outcome: ChangeOutcome.Done,
      model: {
        baseModel: 'SDXL 1.0',
        triggerWords: ['add detail', 'sharp'],
        custom: { description: null, notes: 'keep low' }
      }
    })
  })

  it('reports Missing for a model nothing knows', () => {
    expect(service().save({ kind: ModelKind.Lora, identity: 'ghost' }, EMPTY_MODEL_FIELDS)).toEqual(
      {
        outcome: ChangeOutcome.Missing
      }
    )
  })

  it('adds a model by file name, and reports Duplicate for one with an entry', () => {
    const models = service()
    const added = models.create(ModelKind.Lora, 'loras/My Style.safetensors', EMPTY_MODEL_FIELDS)
    expect(added).toMatchObject({
      outcome: ChangeOutcome.Done,
      model: { identity: 'my style', name: 'My Style', imageCount: 0 }
    })
    expect(models.create(ModelKind.Lora, 'MY STYLE', EMPTY_MODEL_FIELDS)).toMatchObject({
      outcome: ChangeOutcome.Duplicate,
      existing: { identity: 'my style' }
    })
    expect(models.create(ModelKind.Checkpoint, 'my style', EMPTY_MODEL_FIELDS).outcome).toBe(
      ChangeOutcome.Done
    )
  })

  it('documents a library model the first time it is named', () => {
    expect(service().create(ModelKind.Lora, 'Detail', EMPTY_MODEL_FIELDS)).toMatchObject({
      outcome: ChangeOutcome.Done,
      model: { identity: 'detail', imageCount: 2 }
    })
  })

  it('refuses a name that is only an extension', () => {
    expect(() => service().create(ModelKind.Lora, '.safetensors', EMPTY_MODEL_FIELDS)).toThrow(
      RangeError
    )
  })

  it('gets a model or null, and clears an entry', () => {
    const models = service()
    expect(models.get(key)).toMatchObject({ name: 'detail', hasInfo: false })
    expect(models.get({ kind: ModelKind.Lora, identity: 'ghost' })).toBeNull()
    models.save(key, { ...EMPTY_MODEL_FIELDS, notes: 'x' })
    expect(models.clear(key)).toBe(true)
    expect(models.clear(key)).toBe(false)
  })
})
