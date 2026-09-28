import { describe, expect, it, vi } from 'vitest'
import type { ImageId } from '@domain/library'
import { ByteLruCache } from './byte-lru-cache'
import { ConcurrencyLimiter } from './concurrency-limiter'
import { DisplayCopies } from './display-copies'
import type { ImageFileResolver, ResolvedImageFile } from './image-file-resolver'

interface Harness {
  readonly copies: DisplayCopies
  readonly resizeToWebp: ReturnType<typeof vi.fn>
  readonly current: { file: ResolvedImageFile | undefined }
}

function setup(file: ResolvedImageFile | undefined): Harness {
  const current = { file }
  const files = { resolve: vi.fn(async () => current.file) } as unknown as ImageFileResolver
  const resizeToWebp = vi.fn(async () => new Uint8Array([1, 2, 3]))
  const copies = new DisplayCopies(
    files,
    { resizeToWebp },
    new ByteLruCache<string>(1024),
    new ConcurrencyLimiter(2)
  )
  return { copies, resizeToWebp, current }
}

const file: ResolvedImageFile = { path: '/lib/big.png', width: 4096, height: 4096, mtimeMs: 1 }

describe('DisplayCopies', () => {
  it('resizes on first request and serves the cached copy afterwards', async () => {
    const { copies, resizeToWebp } = setup(file)
    await expect(copies.render(1 as ImageId, 600)).resolves.toEqual(new Uint8Array([1, 2, 3]))
    await copies.render(1 as ImageId, 600)
    expect(resizeToWebp).toHaveBeenCalledExactlyOnceWith('/lib/big.png', 600)
  })

  it('makes a new copy when the file changed', async () => {
    const { copies, resizeToWebp, current } = setup(file)
    await copies.render(1 as ImageId, 600)
    current.file = { ...file, mtimeMs: 2 }
    await copies.render(1 as ImageId, 600)
    expect(resizeToWebp).toHaveBeenCalledTimes(2)
  })

  it('returns null without resizing when the image cannot be resolved', async () => {
    const { copies, resizeToWebp } = setup(undefined)
    await expect(copies.render(1 as ImageId, 600)).resolves.toBeNull()
    expect(resizeToWebp).not.toHaveBeenCalled()
  })
})
