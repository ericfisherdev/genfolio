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

/**
 * Past the head, a read pulls in this much at once. A PNG's text can follow its image data
 * (Pillow writes ~64 KB IDAT chunks), so walking chunk headers would otherwise cost one
 * syscall per chunk; a window serves the next few chunk headers from memory.
 */
const WINDOW_BYTES = 256 * 1024

interface Window {
  readonly start: number
  readonly bytes: Uint8Array
}

/**
 * A source over an open file. Small reads are served from one window of the file that is
 * replaced when a read falls outside it; reads larger than a window go straight to the file.
 */
export async function fileSource(handle: FileHandle): Promise<ByteSource> {
  const { size } = await handle.stat()
  const readAt = async (offset: number, length: number): Promise<Uint8Array> => {
    const buffer = Buffer.alloc(Math.max(0, Math.min(length, size - offset)))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset)
    return buffer.subarray(0, bytesRead)
  }
  let window: Window = { start: 0, bytes: new Uint8Array(0) }
  const covers = (offset: number, end: number): boolean =>
    window.start <= offset && end <= window.start + window.bytes.length
  return {
    size,
    read: async (offset, length) => {
      const end = Math.min(size, offset + length)
      if (offset >= end) return new Uint8Array(0)
      if (!covers(offset, end)) {
        if (length > WINDOW_BYTES) return readAt(offset, length)
        const fetch = Math.max(length, offset === 0 ? HEAD_BYTES : WINDOW_BYTES)
        window = { start: offset, bytes: await readAt(offset, fetch) }
      }
      return window.bytes.subarray(offset - window.start, end - window.start)
    }
  }
}
