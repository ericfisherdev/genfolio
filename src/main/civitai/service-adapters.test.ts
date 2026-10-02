import { describe, expect, it, vi } from 'vitest'
import { ModelKind } from '@shared/generation-kinds'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { ServiceDownloadAdapters } from './service-adapters'

const adapters = (
  reply: (method: ServiceMethod) => unknown
): {
  adapters: ServiceDownloadAdapters
  request: ReturnType<typeof vi.fn>
} => {
  const request = vi.fn(async (method: ServiceMethod) => reply(method))
  return {
    adapters: new ServiceDownloadAdapters({ request } as unknown as ServiceRequester),
    request
  }
}

describe('ServiceDownloadAdapters', () => {
  it('asks the service for the plan and the folders', async () => {
    const { adapters: a, request } = adapters((method) =>
      method === ServiceMethod.ModelFolders ? { checkpoint: '/c', lora: '/l' } : { fileName: 'x' }
    )
    await expect(a.folders()).resolves.toEqual({ checkpoint: '/c', lora: '/l' })
    await a.plan(5, 9)
    expect(request).toHaveBeenLastCalledWith(ServiceMethod.CivitaiDownloadPlan, {
      modelId: 5,
      versionId: 9
    })
  })

  it('adds the file to the models and links it to its Civitai version', async () => {
    const { adapters: a, request } = adapters((method) =>
      method === ServiceMethod.ModelsCreate ? { outcome: 'done' } : { outcome: 'linked' }
    )
    await a.record(ModelKind.Lora, 'Add-Detail-XL.safetensors', 5, 9)
    expect(request).toHaveBeenNthCalledWith(1, ServiceMethod.ModelsCreate, {
      kind: 'lora',
      name: 'Add-Detail-XL.safetensors',
      fields: expect.objectContaining({ triggerWords: [] })
    })
    expect(request).toHaveBeenNthCalledWith(2, ServiceMethod.ModelsCivitaiLink, {
      key: { kind: 'lora', identity: 'add-detail-xl' },
      modelId: 5,
      versionId: 9
    })
  })

  it('links a model that was already listed', async () => {
    const { adapters: a, request } = adapters((method) =>
      method === ServiceMethod.ModelsCreate
        ? { outcome: 'duplicate', existing: {} }
        : { outcome: 'linked' }
    )
    await a.record(ModelKind.Checkpoint, 'alpha.ckpt', 1, 2)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('leaves a model linked to another Civitai version alone', async () => {
    const { adapters: a, request } = adapters((method) =>
      method === ServiceMethod.ModelsCreate
        ? { outcome: 'duplicate', existing: { civitai: { modelId: 5, versionId: 8 } } }
        : { outcome: 'linked' }
    )
    await expect(a.record(ModelKind.Lora, 'detail.safetensors', 5, 9)).rejects.toThrow(
      /already linked to another/
    )
    await expect(a.record(ModelKind.Lora, 'detail.safetensors', 6, 8)).rejects.toThrow(
      /already linked to another/
    )
    expect(request).not.toHaveBeenCalledWith(ServiceMethod.ModelsCivitaiLink, expect.anything())
  })

  it('refreshes a model already linked to this same version', async () => {
    const { adapters: a, request } = adapters((method) =>
      method === ServiceMethod.ModelsCreate
        ? { outcome: 'duplicate', existing: { civitai: { modelId: 5, versionId: 9 } } }
        : { outcome: 'linked' }
    )
    await a.record(ModelKind.Lora, 'detail.safetensors', 5, 9)
    expect(request).toHaveBeenCalledWith(ServiceMethod.ModelsCivitaiLink, expect.anything())
  })

  it('fails when the model cannot be added or linked', async () => {
    const missing = adapters(() => ({ outcome: 'missing' }))
    await expect(missing.adapters.record(ModelKind.Lora, 'a.safetensors', 1, 2)).rejects.toThrow(
      /could not be added/
    )
    const notFound = adapters((method) =>
      method === ServiceMethod.ModelsCreate ? { outcome: 'done' } : { outcome: 'not-found' }
    )
    await expect(notFound.adapters.record(ModelKind.Lora, 'a.safetensors', 1, 2)).rejects.toThrow(
      /could not be linked/
    )
  })
})
