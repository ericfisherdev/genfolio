import { describe, expect, it, vi } from 'vitest'
import { DownloadError } from '@domain/downloads'
import { HttpDownloadSource } from './http-download-source'

const URL_START = 'https://civitai.com/api/download/models/9'
const STORAGE = 'https://storage.example.net/file.safetensors?sig=abc'

const stream = (...chunks: string[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    }
  })

const file = (headers: Record<string, string> = {}): Response =>
  new Response(stream('abc', 'def'), {
    status: 200,
    headers: { 'content-type': 'application/octet-stream', 'content-length': '6', ...headers }
  })

const redirect = (location: string, status = 307): Response =>
  new Response(null, { status, headers: { location } })

type Fetch = ReturnType<typeof vi.fn<(url: URL, init: RequestInit) => Promise<Response>>>

function source(
  respond: (url: URL, init: RequestInit) => Response | Promise<Response>,
  key: string | undefined = undefined,
  options: ConstructorParameters<typeof HttpDownloadSource>[2] = {}
): { source: HttpDownloadSource; fetch: Fetch } {
  const fetch: Fetch = vi.fn(async (url, init) => respond(url, init))
  return {
    source: new HttpDownloadSource(
      fetch as unknown as typeof globalThis.fetch,
      async () => key,
      options
    ),
    fetch
  }
}

const read = async (chunks: AsyncIterable<Uint8Array>): Promise<string> => {
  let text = ''
  for await (const chunk of chunks) text += new TextDecoder().decode(chunk)
  return text
}

const live = (): AbortSignal => new AbortController().signal

describe('HttpDownloadSource', () => {
  it("follows Civitai's redirect to its storage and streams the file", async () => {
    const { source: civitai, fetch } = source((url) =>
      url.hostname === 'civitai.com' ? redirect(STORAGE) : file()
    )
    const body = await civitai.open(URL_START, live())
    expect(body.totalBytes).toBe(6)
    expect(await read(body.chunks)).toBe('abcdef')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(String(fetch.mock.calls[1]?.[0])).toBe(STORAGE)
  })

  it('sends the API key to civitai.com only, never on to the storage host', async () => {
    const { source: civitai, fetch } = source(
      (url) => (url.hostname === 'civitai.com' ? redirect(STORAGE) : file()),
      'secret-key'
    )
    await civitai.open(URL_START, live())
    expect((fetch.mock.calls[0]?.[1].headers as Record<string, string>)['Authorization']).toBe(
      'Bearer secret-key'
    )
    expect(fetch.mock.calls[1]?.[1].headers).toEqual({})
  })

  it('sends no Authorization header without a key', async () => {
    const { source: civitai, fetch } = source(() => file())
    await civitai.open(URL_START, live())
    expect(fetch.mock.calls[0]?.[1].headers).toEqual({})
  })

  it.each([
    ['another host', 'https://evil.example/a.safetensors'],
    ['a look-alike host', 'https://civitai.com.evil.example/a'],
    ['plain http', 'http://civitai.com/api/download/models/9'],
    ['not a URL', 'nonsense']
  ])('refuses to start at %s', async (_name, url) => {
    const { source: civitai, fetch } = source(() => file(), 'secret-key')
    await expect(civitai.open(url, live())).rejects.toBeInstanceOf(
      url === 'nonsense' ? TypeError : DownloadError
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a redirect to plain http, and gives up after five redirects', async () => {
    const insecure = source(() => redirect('http://storage.example.net/x'))
    await expect(insecure.source.open(URL_START, live())).rejects.toThrow(/insecure/)
    const loop = source(() => redirect(STORAGE))
    await expect(loop.source.open(URL_START, live())).rejects.toThrow(/too many times/)
    expect(loop.fetch).toHaveBeenCalledTimes(6)
  })

  it('resolves a relative redirect against the current address', async () => {
    const { source: civitai, fetch } = source((url) =>
      url.pathname === '/api/download/models/9' ? redirect('/files/a.safetensors') : file()
    )
    await civitai.open(URL_START, live())
    expect(String(fetch.mock.calls[1]?.[0])).toBe('https://civitai.com/files/a.safetensors')
  })

  it.each([
    [401, /API key/],
    [403, /API key/],
    [404, /no longer has this file/],
    [429, /limiting requests/],
    [503, /HTTP 503/]
  ])('explains HTTP %s', async (status, message) => {
    const { source: civitai } = source(() => new Response('', { status }))
    await expect(civitai.open(URL_START, live())).rejects.toThrow(message)
  })

  it('takes an HTML page for a request to log in', async () => {
    const { source: civitai } = source(
      () =>
        new Response('<html>Log in</html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        })
    )
    await expect(civitai.open(URL_START, live())).rejects.toThrow(/API key/)
  })

  it('reports an unknown size as null', async () => {
    const { source: civitai } = source(
      () =>
        new Response(stream('x'), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' }
        })
    )
    expect((await civitai.open(URL_START, live())).totalBytes).toBeNull()
  })

  it('explains an unreachable or slow Civitai', async () => {
    const down = source(() => {
      throw new TypeError('fetch failed')
    })
    await expect(down.source.open(URL_START, live())).rejects.toThrow('Could not reach Civitai.')
    const slow = source(() => {
      throw new DOMException('timed out', 'TimeoutError')
    })
    await expect(slow.source.open(URL_START, live())).rejects.toThrow('did not answer in time')
  })

  it('lets a cancelled download stay cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const { source: civitai } = source(() => {
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(civitai.open(URL_START, controller.signal)).rejects.toMatchObject({
      name: 'AbortError'
    })
  })

  it('gives up on a stream that stalls', async () => {
    const hung = new ReadableStream<Uint8Array>({ start: () => undefined })
    const { source: civitai } = source(
      () =>
        new Response(hung, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' }
        }),
      undefined,
      { stallTimeoutMs: 20 }
    )
    const body = await civitai.open(URL_START, live())
    await expect(read(body.chunks)).rejects.toThrow(/stalled/)
  })

  it('stops reading when the download is cancelled', async () => {
    let cancelled = false
    const endless = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.enqueue(new Uint8Array(1)),
      cancel: () => {
        cancelled = true
      }
    })
    const controller = new AbortController()
    const { source: civitai } = source(
      () =>
        new Response(endless, {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' }
        })
    )
    const body = await civitai.open(URL_START, controller.signal)
    let bytes = 0
    for await (const chunk of body.chunks) {
      bytes += chunk.length
      if (bytes === 3) controller.abort()
      if (bytes > 50) break
    }
    expect(cancelled).toBe(true)
  })
})
