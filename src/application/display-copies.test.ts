import type { FileHandle } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { ImageId } from '@domain/library'
import { ByteLruCache } from './byte-lru-cache'
import { ConcurrencyLimiter } from './concurrency-limiter'
import { DisplayCopies } from './display-copies'
import type { OpenImageFile } from './image-file-resolver'

interface Harness {
  readonly copies: DisplayCopies
  readonly resizeToWebp: ReturnType<typeof vi.fn>
  readonly closed: () => number
  readonly file: { mtimeMs: number; exists: boolean }
}

function setup(): Harness {
  let closes = 0
  const file = { mtimeMs: 1, exists: true }
  const open = async (): Promise<OpenImageFile | undefined> => {
    if (!file.exists) return undefined
    const handle = {
      readFile: async () => Buffer.from('source'),
      close: async () => {
        closes++
      }
    } as unknown as FileHandle
    return { handle, fileName: 'big.png', width: 4096, height: 4096, mtimeMs: file.mtimeMs }
  }
  const resizeToWebp = vi.fn(async () => new Uint8Array([1, 2, 3]))
  const copies = new DisplayCopies(
    { open },
    { resizeToWebp },
    new ByteLruCache<string>(1024),
    new ConcurrencyLimiter(2)
  )
  return { copies, resizeToWebp, closed: () => closes, file }
}

describe('DisplayCopies', () => {
  it('resizes the bytes read from the verified handle, then serves the cached copy', async () => {
    const { copies, resizeToWebp, closed } = setup()
    await expect(copies.render(1 as ImageId, 600)).resolves.toEqual(new Uint8Array([1, 2, 3]))
    await copies.render(1 as ImageId, 600)
    expect(resizeToWebp).toHaveBeenCalledExactlyOnceWith(Buffer.from('source'), 600)
    expect(closed()).toBe(2)
  })

  it('makes a new copy when the file’s mtime changed, even without a rescan', async () => {
    const { copies, resizeToWebp, file } = setup()
    await copies.render(1 as ImageId, 600)
    file.mtimeMs = 2
    await copies.render(1 as ImageId, 600)
    expect(resizeToWebp).toHaveBeenCalledTimes(2)
  })

  it('returns null without resizing when the image cannot be opened', async () => {
    const { copies, resizeToWebp, file } = setup()
    file.exists = false
    await expect(copies.render(1 as ImageId, 600)).resolves.toBeNull()
    expect(resizeToWebp).not.toHaveBeenCalled()
  })
})
