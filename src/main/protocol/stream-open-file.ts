import { Readable } from 'node:stream'
import type { OpenImageFile } from '@application/image-file-resolver'

/** Web stream over the verified handle; closes the handle on end, error or cancel. */
export function streamOpenFile(file: OpenImageFile): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    file.handle.createReadStream({ autoClose: true })
  ) as ReadableStream<Uint8Array>
}
