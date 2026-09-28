import type { FileHandle } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { OpenImageFile } from '@application/image-file-resolver'
import { createImageRequestHandler } from './image-request-handler'

interface Harness {
  get(url: string): Promise<Response>
  readonly streamFile: ReturnType<typeof vi.fn>
  readonly renderDisplayCopy: ReturnType<typeof vi.fn>
  readonly closed: () => boolean
}

function setup(size: { width: number; height: number } | undefined, fileName = 'a.png'): Harness {
  let closed = false
  const handle = {
    close: async () => {
      closed = true
    }
  } as unknown as FileHandle
  const file: OpenImageFile | undefined = size && { handle, fileName, mtimeMs: 1, ...size }
  const streamFile = vi.fn(
    () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([9, 9]))
          controller.close()
        }
      })
  )
  const renderDisplayCopy = vi.fn(async () => new Uint8Array([1, 2, 3]))
  const handle$ = createImageRequestHandler({
    openImage: async () => file,
    streamFile,
    renderDisplayCopy
  })
  return {
    get: (url) => handle$(new Request(url)),
    streamFile,
    renderDisplayCopy,
    closed: () => closed
  }
}

const small = { width: 1024, height: 1024 }
const large = { width: 4096, height: 4096 }

describe('image request handler', () => {
  it('streams the original from the verified handle with its content type and no-store', async () => {
    const { get, streamFile } = setup(small, 'b.webp')
    const response = await get('genfolio://img/7')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([9, 9]))
    expect(streamFile).toHaveBeenCalledOnce()
  })

  it('serves the original for a small image even in grid mode', async () => {
    const { get, renderDisplayCopy } = setup(small)
    expect((await get('genfolio://img/7?display=grid')).status).toBe(200)
    expect(renderDisplayCopy).not.toHaveBeenCalled()
  })

  it('closes the handle and serves an in-memory WebP copy for a large image in grid mode', async () => {
    const { get, streamFile, renderDisplayCopy, closed } = setup(large)
    const response = await get('genfolio://img/7?display=grid')
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(renderDisplayCopy).toHaveBeenCalledWith(7, 600)
    expect(streamFile).not.toHaveBeenCalled()
    expect(closed()).toBe(true)
  })

  it('always serves the original when the grid is not asked for', async () => {
    const { get, renderDisplayCopy } = setup(large)
    await get('genfolio://img/7')
    expect(renderDisplayCopy).not.toHaveBeenCalled()
  })

  it.each(['genfolio://img/abc', 'genfolio://img/..%2F..%2Fetc%2Fpasswd', 'genfolio://x/7'])(
    'returns 404 for %s',
    async (url) => {
      expect((await setup(small).get(url)).status).toBe(404)
    }
  )

  it('returns 404 when the image cannot be opened', async () => {
    expect((await setup(undefined).get('genfolio://img/7')).status).toBe(404)
  })
})
