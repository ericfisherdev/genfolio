import { DownloadError, type DownloadBody, type DownloadSource } from '@domain/downloads'

const CIVITAI_HOST = 'civitai.com'
const MAX_REDIRECTS = 5
const REDIRECTS = new Set([301, 302, 303, 307, 308])
const CONNECT_TIMEOUT_MS = 30_000
const STALL_TIMEOUT_MS = 60_000

const NEEDS_KEY =
  'Civitai wants a login for this file. Add a Civitai API key in Settings and try again.'

export interface HttpDownloadOptions {
  readonly connectTimeoutMs?: number
  /** How long the stream may go without a byte before the download is given up on. */
  readonly stallTimeoutMs?: number
}

/**
 * Fetches Civitai files. A download starts only on civitai.com over https and the API key goes
 * only there; Civitai hands the file itself to its storage by redirect, which is followed
 * by hand (up to five, https only) so the key never travels beyond Civitai.
 */
export class HttpDownloadSource implements DownloadSource {
  private readonly connectTimeoutMs: number
  private readonly stallTimeoutMs: number

  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly apiKey: () => Promise<string | undefined>,
    options: HttpDownloadOptions = {}
  ) {
    this.connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS
    this.stallTimeoutMs = options.stallTimeoutMs ?? STALL_TIMEOUT_MS
  }

  async open(url: string, signal: AbortSignal): Promise<DownloadBody> {
    const start = new URL(url)
    if (start.protocol !== 'https:' || start.hostname !== CIVITAI_HOST) {
      throw new DownloadError('Only files on civitai.com can be downloaded.')
    }
    const key = await this.apiKey()
    const response = await this.follow(start, key, signal)
    if (!response.ok) throw statusError(response.status)
    if (response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) {
      throw new DownloadError(NEEDS_KEY)
    }
    if (!response.body) throw new DownloadError('Civitai sent no file.')
    return {
      totalBytes: lengthOf(response),
      chunks: this.stream(response.body, signal)
    }
  }

  private async follow(
    start: URL,
    key: string | undefined,
    signal: AbortSignal
  ): Promise<Response> {
    let url = start
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await this.request(url, key, signal)
      const location = REDIRECTS.has(response.status) ? response.headers.get('location') : null
      if (!location) return response
      await response.body?.cancel()
      url = nextUrl(url, location)
    }
    throw new DownloadError('Civitai redirected too many times.')
  }

  private async request(url: URL, key: string | undefined, signal: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = {}
    if (key && url.hostname === CIVITAI_HOST) headers['Authorization'] = `Bearer ${key}`
    try {
      return await this.fetchImpl(url, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.connectTimeoutMs)])
      })
    } catch (error) {
      if (signal.aborted) throw error
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      throw new DownloadError(
        timedOut ? 'Civitai did not answer in time.' : 'Could not reach Civitai.'
      )
    }
  }

  private async *stream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal
  ): AsyncGenerator<Uint8Array> {
    const reader = body.getReader()
    const stop = (): void => void reader.cancel().catch(() => undefined)
    signal.addEventListener('abort', stop, { once: true })
    try {
      for (;;) {
        const { done, value } = await this.readWithin(reader)
        if (done) return
        yield value
      }
    } finally {
      signal.removeEventListener('abort', stop)
      stop()
    }
  }

  private async readWithin(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<ReadableStreamReadResult<Uint8Array>> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stalled = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new DownloadError('The download stalled, so it was given up on.')),
        this.stallTimeoutMs
      )
    })
    try {
      return await Promise.race([reader.read(), stalled])
    } catch (error) {
      if (error instanceof DownloadError) throw error
      throw new DownloadError('The connection to Civitai was lost.')
    } finally {
      clearTimeout(timer)
    }
  }
}

/** A redirect's target, which must be https; relative addresses are against the current one. */
function nextUrl(current: URL, location: string): URL {
  let next: URL
  try {
    next = new URL(location, current)
  } catch {
    throw new DownloadError('Civitai sent an address Genfolio could not follow.')
  }
  if (next.protocol !== 'https:')
    throw new DownloadError('Civitai redirected to an insecure address.')
  return next
}

function lengthOf(response: Response): number | null {
  const length = Number(response.headers.get('content-length'))
  return response.headers.has('content-length') && Number.isInteger(length) && length >= 0
    ? length
    : null
}

function statusError(status: number): DownloadError {
  if (status === 401 || status === 403) return new DownloadError(NEEDS_KEY)
  if (status === 404) return new DownloadError('Civitai no longer has this file.')
  if (status === 429)
    return new DownloadError('Civitai is limiting requests; try again in a minute.')
  return new DownloadError(`Civitai answered with an error (HTTP ${status}).`)
}
