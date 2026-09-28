import { describe, expect, it, vi } from 'vitest'
import type { ResolvedImageFile } from '@application/image-file-resolver'
import { createImageRequestHandler } from './image-request-handler'

const small: ResolvedImageFile = { path: '/lib/small.png', width: 1024, height: 1024, mtimeMs: 1 }
const large: ResolvedImageFile = { path: '/lib/large.png', width: 4096, height: 4096, mtimeMs: 1 }

interface Harness {
  get(url: string): Promise<Response>
  readonly fetchFile: ReturnType<typeof vi.fn>
  readonly renderDisplayCopy: ReturnType<typeof vi.fn>
}

function setup(file: ResolvedImageFile | undefined): Harness {
  const fetchFile = vi.fn(
    async () => new Response(new Uint8Array([9, 9]), { headers: { 'content-type': 'image/png' } })
  )
  const renderDisplayCopy = vi.fn(async () => new Uint8Array([1, 2, 3]))
  const handle = createImageRequestHandler({
    files: { resolve: async () => file },
    fetchFile,
    renderDisplayCopy
  })
  const get = (url: string): Promise<Response> => handle(new Request(url))
  return { get, fetchFile, renderDisplayCopy }
}

describe('image request handler', () => {
  it('serves the original bytes with no-store caching', async () => {
    const { get, fetchFile } = setup(small)
    const response = await get('genfolio://img/7')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([9, 9]))
    expect(fetchFile).toHaveBeenCalledWith('/lib/small.png')
  })

  it('serves the original for a small image even in grid mode', async () => {
    const { get, renderDisplayCopy } = setup(small)
    expect((await get('genfolio://img/7?display=grid')).status).toBe(200)
    expect(renderDisplayCopy).not.toHaveBeenCalled()
  })

  it('serves an in-memory WebP copy for a large image in grid mode', async () => {
    const { get, fetchFile, renderDisplayCopy } = setup(large)
    const response = await get('genfolio://img/7?display=grid')
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(renderDisplayCopy).toHaveBeenCalledWith(7, 600)
    expect(fetchFile).not.toHaveBeenCalled()
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

  it('returns 404 when the image cannot be resolved', async () => {
    expect((await setup(undefined).get('genfolio://img/7')).status).toBe(404)
  })
})
