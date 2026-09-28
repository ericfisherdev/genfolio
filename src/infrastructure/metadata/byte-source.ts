import type { FileHandle } from 'node:fs/promises'

/** Random-access bytes, so readers can skip image data instead of loading whole files. */
export interface ByteSource {
  readonly size: number
  /**
   * Up to `length` bytes at `offset`; shorter only at the end of the source. The bytes may be
   * shared with later reads, so callers must not modify them.
   */
  read(offset: number, length: number): Promise<Uint8Array>
}

export function memorySource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, Math.min(bytes.length, offset + length))
  }
}

/**
 * Metadata usually sits in the first few KB (signature, headers, text chunks, EXIF), so one
 * read of the file's head serves every small read there instead of one read per header.
 */
const HEAD_BYTES = 64 * 1024

export async function fileSource(handle: FileHandle): Promise<ByteSource> {
  const { size } = await handle.stat()
  const readAt = async (offset: number, length: number): Promise<Uint8Array> => {
    const buffer = Buffer.alloc(Math.max(0, Math.min(length, size - offset)))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
    return buffer.subarray(0, bytesRead)
  }
  let head: Promise<Uint8Array> | undefined
  return {
    size,
    read: async (offset, length) => {
      if (offset + length > HEAD_BYTES) return readAt(offset, length)
      head ??= readAt(0, HEAD_BYTES)
      const bytes = await head
      return bytes.subarray(offset, Math.min(bytes.length, offset + length))
    }
  }
}
