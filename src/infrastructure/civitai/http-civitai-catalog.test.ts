import { describe, expect, it, vi } from 'vitest'
import { CivitaiUnavailableError } from '@domain/civitai'
import { ModelKind } from '@shared/generation-kinds'
import { HttpCivitaiCatalog } from './http-civitai-catalog'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const MODEL = {
  id: 122359,
  name: 'Detail Tweaker XL',
  type: 'LORA',
  description: '<p>Detail tweaker for SDXL.</p>',
  nsfw: false,
  tags: ['concept', 'detail'],
  creator: { username: 'w4r10ck' },
  stats: { downloadCount: 455250, thumbsUpCount: 43677, extra: 1 },
  somethingNew: true,
  modelVersions: [
    {
      id: 135867,
      name: 'v1.0',
      baseModel: 'SDXL 1.0',
      trainedWords: [' add detail ', ''],
      description: null,
      publishedAt: '2023-08-07T14:55:02.627Z',
      files: [
        {
          name: 'add-detail-xl.safetensors',
          sizeKB: 223097.99,
          type: 'Model',
          primary: true,
          downloadUrl: 'https://civitai.com/api/download/models/135867',
          hashes: { AutoV2: '0D9BD1B873' }
        }
      ]
    }
  ]
}

function catalog(respond: (url: string) => Response | Promise<Response>): {
  catalog: HttpCivitaiCatalog
  fetch: ReturnType<typeof vi.fn>
} {
  const fetch = vi.fn(async (url: string) => respond(url))
  return { catalog: new HttpCivitaiCatalog(fetch as unknown as typeof globalThis.fetch), fetch }
}

describe('HttpCivitaiCatalog', () => {
  it('finds a version by hash and escapes the hash in the URL', async () => {
    const { catalog: civitai, fetch } = catalog(() => json({ id: 135867, modelId: 122359 }))
    await expect(civitai.versionByHash('0d9bd1b873')).resolves.toEqual({
      modelId: 122359,
      versionId: 135867
    })
    await civitai.versionByHash('a/b?c')
    expect(fetch.mock.calls[1]?.[0]).toBe(
      'https://civitai.com/api/v1/model-versions/by-hash/a%2Fb%3Fc'
    )
  })

  it('answers null when Civitai has no such hash or model', async () => {
    const { catalog: civitai } = catalog(() => json({ error: 'nope' }, 404))
    await expect(civitai.versionByHash('deadbeef00')).resolves.toBeNull()
    await expect(civitai.model(1)).resolves.toBeNull()
  })

  it('reads a model into plain text and ignores fields it does not use', async () => {
    const { catalog: civitai } = catalog(() => json(MODEL))
    const model = await civitai.model(122359)
    expect(model).toMatchObject({
      id: 122359,
      name: 'Detail Tweaker XL',
      description: 'Detail tweaker for SDXL.',
      creator: 'w4r10ck',
      downloads: 455250,
      tags: ['concept', 'detail']
    })
    expect(model?.versions[0]).toMatchObject({
      id: 135867,
      baseModel: 'SDXL 1.0',
      trainedWords: ['add detail'],
      description: null
    })
    expect(model?.versions[0]?.files[0]).toMatchObject({
      name: 'add-detail-xl.safetensors',
      primary: true,
      hashes: { AutoV2: '0D9BD1B873' }
    })
  })

  it('splits trigger words written as one comma-separated entry, without repeats or empties', async () => {
    const { catalog: civitai } = catalog(() =>
      json({
        ...MODEL,
        modelVersions: [
          {
            ...MODEL.modelVersions[0],
            trainedWords: [
              'abstractionism, brush stroke, traditional media,',
              'Brush Stroke',
              ' ,, ',
              'solo'
            ]
          }
        ]
      })
    )
    const model = await civitai.model(1)
    expect(model?.versions[0]?.trainedWords).toEqual([
      'abstractionism',
      'brush stroke',
      'traditional media',
      'solo'
    ])
  })

  it('tolerates a model with most fields missing', async () => {
    const { catalog: civitai } = catalog(() => json({ id: 1, name: 'bare', type: 'Checkpoint' }))
    await expect(civitai.model(1)).resolves.toMatchObject({
      description: null,
      creator: null,
      nsfw: false,
      tags: [],
      versions: []
    })
  })

  it('searches by the types of the kind and keeps the models it can read', async () => {
    const { catalog: civitai, fetch } = catalog(() =>
      json({ items: [MODEL, { id: 'bad' }, { ...MODEL, id: 2 }] })
    )
    const found = await civitai.searchModels({
      kind: ModelKind.Lora,
      text: 'add detail',
      limit: 20
    })
    expect(found.models.map((model) => model.id)).toEqual([122359, 2])
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.searchParams.get('query')).toBe('add detail')
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.getAll('types')).toEqual(['LORA', 'LoCon', 'DoRA'])
    expect(url.searchParams.has('sort')).toBe(false)
    await civitai.searchModels({ kind: ModelKind.Checkpoint, text: 'x', limit: 5 })
    expect(new URL(String(fetch.mock.calls[1]?.[0])).searchParams.getAll('types')).toEqual([
      'Checkpoint'
    ])
  })

  it('narrows by base model, pages by cursor, and lists the most downloaded without a text', async () => {
    const { catalog: civitai, fetch } = catalog(() =>
      json({ items: [MODEL], metadata: { nextCursor: '99|1' } })
    )
    const page = await civitai.searchModels({
      kind: ModelKind.Lora,
      baseModel: 'SDXL 1.0',
      cursor: '3',
      limit: 10
    })
    expect(page.nextCursor).toBe('99|1')
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.searchParams.get('baseModels')).toBe('SDXL 1.0')
    expect(url.searchParams.get('cursor')).toBe('3')
    expect(url.searchParams.get('sort')).toBe('Most Downloaded')
    expect(url.searchParams.has('query')).toBe(false)
  })

  it('has no next cursor on the last page', async () => {
    const { catalog: civitai } = catalog(() => json({ items: [MODEL], metadata: {} }))
    await expect(
      civitai.searchModels({ kind: ModelKind.Lora, text: 'x', limit: 1 })
    ).resolves.toMatchObject({ nextCursor: null })
    const bare = catalog(() => json({ items: [] }))
    await expect(
      bare.catalog.searchModels({ kind: ModelKind.Lora, text: 'x', limit: 1 })
    ).resolves.toEqual({ models: [], nextCursor: null })
  })

  it.each([
    ['rate limiting', () => json({}, 429), /limiting requests/],
    ['a server error', () => json({}, 503), /HTTP 503/],
    ['a reply that is not JSON', () => new Response('<html>', { status: 200 }), /could not read/],
    ['a reply of the wrong shape', () => json({ id: 'x' }), /could not read/]
  ])('reports %s as unavailable', async (_name, respond, message) => {
    const { catalog: civitai } = catalog(respond)
    const failure = civitai.versionByHash('0d9bd1b873')
    await expect(failure).rejects.toBeInstanceOf(CivitaiUnavailableError)
    await expect(failure).rejects.toThrow(message)
  })

  it('reports an unreachable Civitai without the low-level cause', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('fetch failed: ECONNREFUSED 1.2.3.4:443')
    })
    const civitai = new HttpCivitaiCatalog(fetch as unknown as typeof globalThis.fetch)
    await expect(civitai.model(1)).rejects.toThrow('Could not reach Civitai')
  })

  it('reports a slow Civitai as timed out', async () => {
    const fetch = vi.fn(async () => {
      throw new DOMException('timed out', 'TimeoutError')
    })
    const civitai = new HttpCivitaiCatalog(fetch as unknown as typeof globalThis.fetch)
    await expect(civitai.model(1)).rejects.toThrow('did not answer in time')
  })

  it('gives every request a timeout and asks for JSON', async () => {
    const { catalog: civitai, fetch } = catalog(() => json(MODEL))
    await civitai.model(1)
    const init = fetch.mock.calls[0]?.[1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.headers).toEqual({ Accept: 'application/json' })
  })
})
