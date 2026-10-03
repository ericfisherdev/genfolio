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
  readonly reads: () => number
  readonly closed: () => number
  readonly file: { mtimeMs: number; exists: boolean }
  /** Lets the next resize finish; resizes wait until released. */
  readonly release: () => void
}

function setup(limit = 2, holdResizes = false): Harness {
  let closes = 0
  let reads = 0
  const file = { mtimeMs: 1, exists: true }
  const open = async (): Promise<OpenImageFile | undefined> => {
    if (!file.exists) return undefined
    const handle = {
      readFile: async () => {
        reads++
        return Buffer.from('source')
      },
      close: async () => {
        closes++
      }
    } as unknown as FileHandle
    return {
      handle,
      path: '/lib/big.png',
      fileName: 'big.png',
      width: 4096,
      height: 4096,
      mtimeMs: file.mtimeMs,
      sizeBytes: 1
    }
  }
  const waiting: (() => void)[] = []
  const resizeToWebp = vi.fn(async () => {
    if (holdResizes) await new Promise<void>((resolve) => waiting.push(resolve))
    return new Uint8Array([1, 2, 3])
  })
  const copies = new DisplayCopies(
    { open },
    { resizeToWebp },
    new ByteLruCache<string>(1024),
    new ConcurrencyLimiter(limit)
  )
  return {
    copies,
    resizeToWebp,
    reads: () => reads,
    closed: () => closes,
    file,
    release: () => waiting.shift()?.()
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

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

  it('keeps one copy per width', async () => {
    const { copies, resizeToWebp } = setup()
    await copies.render(1 as ImageId, 400)
    await copies.render(1 as ImageId, 800)
    expect(resizeToWebp).toHaveBeenCalledTimes(2)
  })

  it('shares one read and resize between concurrent requests for the same copy', async () => {
    const { copies, resizeToWebp, reads, closed, release } = setup(4, true)
    const first = copies.render(1 as ImageId, 600)
    const second = copies.render(1 as ImageId, 600)
    await settle()
    expect(resizeToWebp).toHaveBeenCalledOnce()
    release()
    await expect(Promise.all([first, second])).resolves.toEqual([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([1, 2, 3])
    ])
    expect(reads()).toBe(1)
    expect(closed()).toBe(2)
  })

  it('reads a file only once a resize slot is free', async () => {
    const { copies, reads, release } = setup(1, true)
    const first = copies.render(1 as ImageId, 600)
    const second = copies.render(2 as ImageId, 600)
    await settle()
    expect(reads()).toBe(1)
    release()
    await first
    await settle()
    expect(reads()).toBe(2)
    release()
    await second
  })

  it('returns null without resizing when the image cannot be opened', async () => {
    const { copies, resizeToWebp, file } = setup()
    file.exists = false
    await expect(copies.render(1 as ImageId, 600)).resolves.toBeNull()
    expect(resizeToWebp).not.toHaveBeenCalled()
  })

  it('closes the handle and forgets the attempt when the resize fails, so it is retried', async () => {
    const { copies, resizeToWebp, closed } = setup()
    resizeToWebp.mockRejectedValueOnce(new Error('corrupt'))
    await expect(copies.render(1 as ImageId, 600)).rejects.toThrow('corrupt')
    expect(closed()).toBe(1)
    await expect(copies.render(1 as ImageId, 600)).resolves.toEqual(new Uint8Array([1, 2, 3]))
  })
})
