import { z } from 'zod'
import type { ModelDownloader } from '@application/model-downloader'
import { civitaiBrowseQuerySchema } from '@shared/civitai-browse'
import { civitaiKeySchema, type CivitaiKeyStatus } from '@shared/civitai-key'
import { downloadRequestSchema } from '@shared/downloads'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import type { CivitaiApiKeyStore } from '../civitai/api-key-store'
import type { ServiceRequester } from '../service/library-service-client'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

/** What the download channels use: a slice of the downloader and of the key store. */
export type DownloadActions = Pick<ModelDownloader, 'start' | 'cancel' | 'list' | 'clearFinished'>
export type KeyActions = Pick<CivitaiApiKeyStore, 'status' | 'save' | 'clear'>

/**
 * Registers the Civitai browse, download and API key channels. Browsing goes to the service,
 * which talks to civitai.com; a download is described by ids only, so the renderer never names
 * an address or a path.
 */
export function registerDownloadChannels(
  ipc: IpcHandlerRegistry,
  service: ServiceRequester,
  downloads: DownloadActions,
  keys: KeyActions
): void {
  ipc.register(IpcChannel.BrowseCivitai, z.tuple([civitaiBrowseQuerySchema]), (query) =>
    service.request(ServiceMethod.CivitaiBrowse, query)
  )
  ipc.register(IpcChannel.StartDownload, z.tuple([downloadRequestSchema]), async (request) =>
    downloads.start(request)
  )
  ipc.register(IpcChannel.CancelDownload, z.tuple([z.string().min(1).max(100)]), async (id) =>
    downloads.cancel(id)
  )
  ipc.register(IpcChannel.ListDownloads, z.tuple([]), async () => downloads.list())
  ipc.register(IpcChannel.ClearFinishedDownloads, z.tuple([]), async () =>
    downloads.clearFinished()
  )
  ipc.register(IpcChannel.CivitaiKeyStatus, z.tuple([]), () => keys.status())
  ipc.register(
    IpcChannel.SetCivitaiKey,
    z.tuple([civitaiKeySchema]),
    async (key): Promise<CivitaiKeyStatus> => {
      await keys.save(key)
      return keys.status()
    }
  )
  ipc.register(IpcChannel.ClearCivitaiKey, z.tuple([]), async (): Promise<CivitaiKeyStatus> => {
    await keys.clear()
    return keys.status()
  })
}
