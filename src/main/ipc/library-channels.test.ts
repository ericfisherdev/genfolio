import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { AddRootOutcome } from '@shared/library'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import { registerLibraryChannels, type FolderPicker } from './library-channels'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

type Handler = (...args: unknown[]) => unknown

interface Harness {
  readonly handlers: Map<IpcChannel, { schema: z.ZodType; handler: Handler }>
  readonly request: ReturnType<typeof vi.fn>
  invoke(channel: IpcChannel, ...args: unknown[]): unknown
}

function setup(
  pickFolder: FolderPicker,
  results: Partial<Record<ServiceMethod, unknown>> = {}
): Harness {
  const handlers = new Map<IpcChannel, { schema: z.ZodType; handler: Handler }>()
  const registry: IpcHandlerRegistry = {
    register: (channel, schema, handler) =>
      handlers.set(channel, { schema, handler: handler as Handler })
  }
  const request = vi.fn(async (method: ServiceMethod) => results[method])
  registerLibraryChannels(registry, { request } as unknown as ServiceRequester, pickFolder)
  const invoke = (channel: IpcChannel, ...args: unknown[]): unknown => {
    const entry = handlers.get(channel)
    if (!entry) throw new Error(`${channel} not registered`)
    return entry.handler(...(entry.schema.parse(args) as unknown[]))
  }
  return { handlers, request, invoke }
}

describe('registerLibraryChannels', () => {
  it('registers every library channel', () => {
    // Registered by the image, tag and album registrars instead.
    const imageChannels = [
      IpcChannel.RevealImage,
      IpcChannel.CopyImagePath,
      IpcChannel.GetGeneration,
      IpcChannel.CopyGeneration,
      IpcChannel.ListTags,
      IpcChannel.ImageTags,
      IpcChannel.CreateTag,
      IpcChannel.RenameTag,
      IpcChannel.MergeTags,
      IpcChannel.DeleteTag,
      IpcChannel.ApplyTags,
      IpcChannel.RemoveTags,
      IpcChannel.ListAlbums,
      IpcChannel.CreateAlbum,
      IpcChannel.CreateSmartAlbum,
      IpcChannel.RenameAlbum,
      IpcChannel.DeleteAlbum,
      IpcChannel.SetAlbumCover,
      IpcChannel.AddToAlbum,
      IpcChannel.RemoveFromAlbum,
      IpcChannel.MoveInAlbum,
      IpcChannel.DeleteImages,
      IpcChannel.ListPresets,
      IpcChannel.SavePreset,
      IpcChannel.DeletePreset,
      IpcChannel.SimilarityThreshold,
      IpcChannel.SetSimilarityThreshold,
      IpcChannel.SimilarGroups
    ]
    expect([...setup(async () => undefined).handlers.keys()].sort()).toEqual(
      Object.values(IpcChannel)
        .filter((channel) => !imageChannels.includes(channel))
        .sort()
    )
  })

  it('forwards favourite and rating marks, rejecting invalid ones', async () => {
    const { request, invoke } = setup(async () => undefined, {
      [ServiceMethod.SetFavorite]: { changed: 2 },
      [ServiceMethod.SetRating]: { changed: 1 }
    })
    await expect(invoke(IpcChannel.SetFavorite, [1, 2], true)).resolves.toBe(2)
    await expect(invoke(IpcChannel.SetRating, [3], 5)).resolves.toBe(1)
    expect(request).toHaveBeenCalledWith(ServiceMethod.SetRating, { ids: [3], rating: 5 })
    expect(() => invoke(IpcChannel.SetRating, [3], 6)).toThrow()
    expect(() => invoke(IpcChannel.SetFavorite, [], true)).toThrow()
    expect(() => invoke(IpcChannel.SetFavorite, [1], 'yes')).toThrow()
  })

  it('forwards a validated facet query to the service', async () => {
    const facets = { checkpoints: [], loras: [], tags: [], generators: [], withoutMetadata: 0 }
    const { request, invoke } = setup(async () => undefined, {
      [ServiceMethod.SearchFacets]: facets
    })
    const query = { scope: { kind: 'all' }, sort: 'newest', filters: { seed: '1' } }
    await expect(invoke(IpcChannel.SearchFacets, query)).resolves.toBe(facets)
    expect(request).toHaveBeenCalledWith(ServiceMethod.SearchFacets, { query })
    expect(() => invoke(IpcChannel.SearchFacets, { ...query, filters: { seed: '' } })).toThrow()
  })

  it('returns cancelled without calling the service when the picker is dismissed', async () => {
    const { request, invoke } = setup(async () => undefined)
    await expect(invoke(IpcChannel.AddRootViaDialog)).resolves.toEqual({
      outcome: AddRootOutcome.Cancelled
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('adds the picked folder through the service', async () => {
    const added = { outcome: AddRootOutcome.AlreadyAdded, path: '/lib' }
    const { request, invoke } = setup(async () => '/lib', { [ServiceMethod.AddRoot]: added })
    await expect(invoke(IpcChannel.AddRootViaDialog)).resolves.toBe(added)
    expect(request).toHaveBeenCalledWith(ServiceMethod.AddRoot, { path: '/lib' })
  })

  it('unwraps remove and rescan results', async () => {
    const { invoke } = setup(async () => undefined, {
      [ServiceMethod.RemoveRoot]: { removed: true },
      [ServiceMethod.RescanRoot]: { started: false }
    })
    await expect(invoke(IpcChannel.RemoveRoot, 3)).resolves.toBe(true)
    await expect(invoke(IpcChannel.RescanRoot, 3)).resolves.toBe(false)
  })

  it('rejects a non-positive root id at the schema', () => {
    const { invoke } = setup(async () => undefined)
    expect(() => invoke(IpcChannel.RemoveRoot, 0)).toThrow()
  })

  it('forwards gallery queries and caps image requests at 500 ids', async () => {
    const layout = new Int32Array([1, 800, 1200])
    const { request, invoke } = setup(async () => undefined, {
      [ServiceMethod.GalleryLayout]: layout
    })
    const query = { scope: { kind: 'all' }, sort: 'newest' }
    await expect(invoke(IpcChannel.GalleryLayout, query)).resolves.toBe(layout)
    expect(request).toHaveBeenCalledWith(ServiceMethod.GalleryLayout, { query })

    expect(() =>
      invoke(
        IpcChannel.GalleryImages,
        Array.from({ length: 501 }, (_, i) => i + 1)
      )
    ).toThrow()
    expect(() =>
      invoke(IpcChannel.GalleryLayout, { scope: { kind: 'all' }, sort: 'random' })
    ).toThrow()
  })

  it('forwards image and folder-tree requests with their params', async () => {
    const cards = [{ id: 1 }]
    const tree = { id: 5, name: '', children: [] }
    const { request, invoke } = setup(async () => undefined, {
      [ServiceMethod.GalleryImages]: cards,
      [ServiceMethod.DirectoryTree]: tree
    })
    await expect(invoke(IpcChannel.GalleryImages, [3, 4])).resolves.toBe(cards)
    expect(request).toHaveBeenCalledWith(ServiceMethod.GalleryImages, { ids: [3, 4] })
    await expect(invoke(IpcChannel.DirectoryTree, 5)).resolves.toBe(tree)
    expect(request).toHaveBeenCalledWith(ServiceMethod.DirectoryTree, { rootId: 5 })
  })
})
