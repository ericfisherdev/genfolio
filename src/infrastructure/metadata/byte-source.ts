import type { FileHandle } from 'node:fs/promises'

/** Random-access bytes, so readers can skip image data instead of loading whole files. */
export interface ByteSource {
  readonly size: number
  /** Up to `length` bytes at `offset`; shorter only at the end of the source. */
  read(offset: number, length: number): Promise<Uint8Array>
}

export function memorySource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length))
  }
}

export async function fileSource(handle: FileHandle): Promise<ByteSource> {
  const { size } = await handle.stat()
  return {
    size,
    read: async (offset, length) => {
      const buffer = Buffer.alloc(Math.max(0, Math.min(length, size - offset)))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
      return buffer.subarray(0, bytesRead)
    }
  }
}
