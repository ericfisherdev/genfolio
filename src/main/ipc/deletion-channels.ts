import { z } from 'zod'
import type { ImageDeleter } from '@application/image-deleter'
import type { ImageId } from '@domain/library'
import { deleteModeSchema } from '@shared/deletion'
import { MAX_IDS_PER_MARK } from '@shared/gallery'
import { IpcChannel } from '@shared/genfolio-api'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

const imageIds = z.array(z.number().int().positive()).min(1).max(MAX_IDS_PER_MARK)

/** Registers image deletion, which main carries out itself on verified paths. */
export function registerDeletionChannels(
  ipc: IpcHandlerRegistry,
  deleter: Pick<ImageDeleter, 'delete'>
): void {
  ipc.register(IpcChannel.DeleteImages, z.tuple([imageIds, deleteModeSchema]), (ids, mode) =>
    deleter.delete(ids as ImageId[], mode)
  )
}
