import { describe, expect, it } from 'vitest'
import { SqliteAppSettingsRepository } from '@infrastructure/db/repositories/sqlite-app-settings-repository'
import { migratedMemoryDb } from '@infrastructure/db/testing/migrated-memory-db'
import { ModelKind } from '@shared/generation-kinds'
import { ModelFolderSettings } from './model-folder-settings'

const folders = (): ModelFolderSettings =>
  new ModelFolderSettings(new SqliteAppSettingsRepository(migratedMemoryDb()))

describe('ModelFolderSettings', () => {
  it('starts with no folders chosen', () => {
    expect(folders().get()).toEqual({ checkpoint: null, lora: null })
  })

  it('sets each kind on its own and clears one with null', () => {
    const settings = folders()
    settings.set(ModelKind.Lora, '/models/loras')
    expect(settings.set(ModelKind.Checkpoint, '/models/checkpoints')).toEqual({
      checkpoint: '/models/checkpoints',
      lora: '/models/loras'
    })
    expect(settings.set(ModelKind.Lora, null)).toEqual({
      checkpoint: '/models/checkpoints',
      lora: null
    })
  })

  it('treats an empty stored value as not chosen', () => {
    const db = migratedMemoryDb()
    const repository = new SqliteAppSettingsRepository(db)
    repository.set('modelFolder.lora', '')
    expect(new ModelFolderSettings(repository).get().lora).toBeNull()
  })
})
