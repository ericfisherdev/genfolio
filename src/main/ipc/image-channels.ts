import { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import type { ImageFileActions } from '../image-file-actions'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

const imageIdArgs = z.tuple([z.number().int().positive()])

export function registerImageChannels(ipc: IpcHandlerRegistry, actions: ImageFileActions): void {
  ipc.register(IpcChannel.RevealImage, imageIdArgs, (imageId) => actions.reveal(imageId))
  ipc.register(IpcChannel.CopyImagePath, imageIdArgs, (imageId) => actions.copyPath(imageId))
}
