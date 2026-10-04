import type { FileHandle } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { OpenImageFile } from '@application/image-file-resolver'
import { createImageRequestHandler } from './image-request-handler'

interface Harness {
  get(url: string): Promise<Response>
  readonly openImage: ReturnType<typeof vi.fn>
  readonly streamFile: ReturnType<typeof vi.fn>
  readonly renderDisplayCopy: ReturnType<typeof vi.fn>
}

function setup(size: { width: number; height: number } | undefined, fileName = 'a.png'): Harness {
  const handle = { close: async () => undefined } as unknown as FileHandle
  const file: OpenImageFile | undefined = size && {
    handle,
    path: `/lib/${fileName}`,
    fileName,
    mtimeMs: 1,
    sizeBytes: 1,
    ...size
  }
  const openImage = vi.fn(async () => file)
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
    imageDimensions: () => size,
    openImage,
    streamFile,
    renderDisplayCopy
  })
  return { get: (url) => handle$(new Request(url)), openImage, streamFile, renderDisplayCopy }
}

const narrow = { width: 400, height: 400 }
const wide = { width: 1024, height: 1024 }

describe('image request handler', () => {
  it('streams the original from the verified handle with its content type and no-store', async () => {
    const { get, streamFile } = setup(wide, 'b.webp')
    const response = await get('genfolio://img/7')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([9, 9]))
    expect(streamFile).toHaveBeenCalledOnce()
  })

  it('serves an in-memory WebP rendition at the asked width without opening the file in main', async () => {
    const { get, openImage, streamFile, renderDisplayCopy } = setup(wide)
    const response = await get('genfolio://img/7?display=grid&w=600')
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(renderDisplayCopy).toHaveBeenCalledWith(7, 600)
    expect(openImage).not.toHaveBeenCalled()
    expect(streamFile).not.toHaveBeenCalled()
  })

  it('serves the original in grid mode when the image is no wider than the rendition', async () => {
    const { get, renderDisplayCopy, streamFile } = setup(narrow)
    expect((await get('genfolio://img/7?display=grid&w=400')).status).toBe(200)
    expect(renderDisplayCopy).not.toHaveBeenCalled()
    expect(streamFile).toHaveBeenCalledOnce()
  })

  it('always serves the original when the grid is not asked for', async () => {
    const { get, renderDisplayCopy } = setup(wide)
    await get('genfolio://img/7')
    expect(renderDisplayCopy).not.toHaveBeenCalled()
  })

  it.each(['genfolio://img/abc', 'genfolio://img/..%2F..%2Fetc%2Fpasswd', 'genfolio://x/7'])(
    'returns 404 for %s',
    async (url) => {
      expect((await setup(wide).get(url)).status).toBe(404)
    }
  )

  it('returns 404 when the image is unknown or cannot be opened', async () => {
    expect((await setup(undefined).get('genfolio://img/7')).status).toBe(404)
    expect((await setup(undefined).get('genfolio://img/7?display=grid')).status).toBe(404)
  })

  it('returns 404 when the service has no rendition (the file is gone)', async () => {
    const harness = setup(wide)
    harness.renderDisplayCopy.mockResolvedValueOnce(null)
    expect((await harness.get('genfolio://img/7?display=grid')).status).toBe(404)
  })
})
