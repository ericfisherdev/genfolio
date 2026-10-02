import type { ModelKind } from '@shared/generation-kinds'

/** A file of a Civitai model version. */
export interface CivitaiFile {
  readonly name: string
  readonly sizeKb: number | null
  readonly type: string | null
  readonly primary: boolean
  readonly downloadUrl: string | null
  /** By algorithm: AutoV1, AutoV2, SHA256, … */
  readonly hashes: Readonly<Record<string, string>>
}

export interface CivitaiVersion {
  readonly id: number
  readonly name: string
  readonly baseModel: string | null
  readonly trainedWords: readonly string[]
  /** Plain text. */
  readonly description: string | null
  readonly publishedAt: string | null
  readonly files: readonly CivitaiFile[]
}

export interface CivitaiModel {
  readonly id: number
  readonly name: string
  /** Civitai's own type name, e.g. LORA, LoCon, Checkpoint. */
  readonly type: string
  /** Plain text. */
  readonly description: string | null
  readonly creator: string | null
  readonly nsfw: boolean
  readonly tags: readonly string[]
  readonly downloads: number | null
  readonly thumbsUp: number | null
  /** Newest first, as Civitai lists them. */
  readonly versions: readonly CivitaiVersion[]
}

/** Civitai could not answer: unreachable, slow, limiting requests, or an unreadable reply. */
export class CivitaiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CivitaiUnavailableError'
  }
}

/** What to look for among Civitai's models. */
export interface CivitaiSearchQuery {
  readonly kind: ModelKind
  /** Matched against names; none lists the most downloaded. */
  readonly text?: string
  /** Civitai's own base model name, e.g. `SDXL 1.0`. */
  readonly baseModel?: string
  /** From a previous page's `nextCursor`. */
  readonly cursor?: string
  readonly limit: number
}

export interface CivitaiSearchPage {
  readonly models: CivitaiModel[]
  /** Pass as `cursor` for the next page; null at the end. */
  readonly nextCursor: string | null
}

/** The public Civitai catalogue. Every method throws CivitaiUnavailableError when it can't answer. */
export interface CivitaiCatalog {
  /** The model version having a file with this hash (any of the hash forms), or null. */
  versionByHash(hash: string): Promise<{ modelId: number; versionId: number } | null>
  /** The model with its versions, or null when Civitai has none with this id. */
  model(modelId: number): Promise<CivitaiModel | null>
  /** A page of models of one kind, narrowed by name and base model. */
  searchModels(query: CivitaiSearchQuery): Promise<CivitaiSearchPage>
}

/** The model's page on Civitai, at the version when given. */
export function civitaiModelUrl(modelId: number, versionId?: number): string {
  const url = new URL(`https://civitai.com/models/${modelId}`)
  if (versionId !== undefined) url.searchParams.set('modelVersionId', String(versionId))
  return url.toString()
}
