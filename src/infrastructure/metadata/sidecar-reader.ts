import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import type { MetadataRecord } from '@domain/metadata-record'
import { MetadataOrigin } from '@shared/metadata-kinds'

const MAX_SIDECAR_BYTES = 1024 * 1024

/**
 * The A1111 `<image stem>.txt` beside an image as a record, or `undefined` when there is none
 * or it is unusable. Read through one handle so the size check holds at read time: never more
 * than MAX_SIDECAR_BYTES + 1 bytes, and only from a regular file. O_NONBLOCK keeps open from
 * waiting on a FIFO (it changes nothing for regular files). Never throws.
 */
export async function readSidecar(imagePath: string): Promise<MetadataRecord | undefined> {
  const path = imagePath.replace(/\.[^./\\]+$/, '.txt')
  if (path === imagePath) return undefined
  let handle: FileHandle | undefined
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
    const stats = await handle.stat()
    if (!stats.isFile() || stats.size > MAX_SIDECAR_BYTES) return undefined
    const buffer = Buffer.alloc(MAX_SIDECAR_BYTES + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead > MAX_SIDECAR_BYTES) return undefined
    return {
      origin: MetadataOrigin.SidecarTxt,
      key: 'parameters',
      value: buffer.toString('utf8', 0, bytesRead)
    }
  } catch {
    return undefined
  } finally {
    await handle?.close()
  }
}
