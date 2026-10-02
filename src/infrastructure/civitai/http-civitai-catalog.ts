import type { z } from 'zod'
import { CivitaiUnavailableError, type CivitaiCatalog, type CivitaiModel } from '@domain/civitai'
import { ModelKind } from '@shared/generation-kinds'
import { modelOf, modelSchema, searchSchema, versionByHashSchema } from './civitai-responses'

const BASE_URL = 'https://civitai.com/api/v1'
const TIMEOUT_MS = 8_000

// LyCORIS and DoRA files are LoRAs to anyone using them, so searching for a LoRA includes them.
const CIVITAI_TYPES: Readonly<Record<ModelKind, readonly string[]>> = {
  [ModelKind.Checkpoint]: ['Checkpoint'],
  [ModelKind.Lora]: ['LORA', 'LoCon', 'DoRA']
}

export interface HttpCivitaiOptions {
  readonly baseUrl?: string
  readonly timeoutMs?: number
}

/** The public Civitai API over HTTP; it needs no key for what Genfolio reads. */
export class HttpCivitaiCatalog implements CivitaiCatalog {
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(
    private readonly fetchImpl: typeof fetch,
    options: HttpCivitaiOptions = {}
  ) {
    this.baseUrl = options.baseUrl ?? BASE_URL
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS
  }

  async versionByHash(hash: string): Promise<{ modelId: number; versionId: number } | null> {
    const found = await this.get(
      `/model-versions/by-hash/${encodeURIComponent(hash)}`,
      versionByHashSchema
    )
    return found ? { modelId: found.modelId, versionId: found.id } : null
  }

  async model(modelId: number): Promise<CivitaiModel | null> {
    const found = await this.get(`/models/${modelId}`, modelSchema)
    return found ? modelOf(found) : null
  }

  async searchModels(kind: ModelKind, text: string, limit: number): Promise<CivitaiModel[]> {
    const params = new URLSearchParams({ query: text, limit: String(limit) })
    for (const type of CIVITAI_TYPES[kind]) params.append('types', type)
    const found = await this.get(`/models?${params}`, searchSchema)
    // One model that doesn't fit what is read is left out; it doesn't fail the whole search.
    return (found?.items ?? []).flatMap((item) => {
      const parsed = modelSchema.safeParse(item)
      return parsed.success ? [modelOf(parsed.data)] : []
    })
  }

  /** The parsed body, or null on 404. */
  private async get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S> | null> {
    const response = await this.fetchResponse(`${this.baseUrl}${path}`)
    if (response.status === 404) return null
    if (response.status === 429) {
      throw new CivitaiUnavailableError('Civitai is limiting requests; try again in a minute')
    }
    if (!response.ok) {
      throw new CivitaiUnavailableError(`Civitai answered with an error (HTTP ${response.status})`)
    }
    const parsed = schema.safeParse(await this.readJson(response))
    if (!parsed.success) {
      throw new CivitaiUnavailableError('Civitai sent a reply Genfolio could not read')
    }
    return parsed.data
  }

  private async fetchResponse(url: string): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs)
      })
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      throw new CivitaiUnavailableError(
        timedOut ? 'Civitai did not answer in time' : 'Could not reach Civitai'
      )
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch {
      throw new CivitaiUnavailableError('Civitai sent a reply Genfolio could not read')
    }
  }
}
