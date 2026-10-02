import type { CivitaiCatalog, CivitaiModel, CivitaiVersion } from '@domain/civitai'
import { modelIdentity } from '@domain/model-name'
import type { ModelCivitaiRepository, ModelHashLookup } from '@domain/repositories'
import {
  CivitaiOutcome,
  MAX_CIVITAI_CANDIDATES,
  type CivitaiCandidate,
  type CivitaiResult,
  type CivitaiSearchParams
} from '@shared/civitai'
import type { CivitaiRecord } from '@shared/model-civitai'
import type { ModelDetail, ModelKey } from '@shared/models'

/** Models asked of Civitai per search; their versions are what the user picks from. */
const SEARCH_MODELS = 12
/** Hash forms tried per lookup: a model seen by several tools can have a handful. */
const MAX_HASHES_TRIED = 6

const recordOf = (model: CivitaiModel, version: CivitaiVersion): CivitaiRecord => ({
  modelId: model.id,
  versionId: version.id,
  modelName: model.name,
  versionName: version.name,
  baseModel: version.baseModel,
  triggerWords: version.trainedWords,
  description: model.description,
  versionDescription: version.description,
  creator: model.creator,
  nsfw: model.nsfw,
  tags: model.tags,
  downloads: model.downloads,
  thumbsUp: model.thumbsUp,
  publishedAt: version.publishedAt
})

/** Links local models to the Civitai versions they are, and keeps what Civitai says about them. */
export class ModelCivitaiService {
  constructor(
    private readonly catalog: CivitaiCatalog,
    private readonly links: ModelCivitaiRepository,
    private readonly hashes: ModelHashLookup,
    private readonly models: { get(key: ModelKey): ModelDetail | null },
    private readonly now: () => number
  ) {}

  /**
   * Links the model to the Civitai version having a file with one of the hashes seen for it:
   * an exact match, no guessing. NotFound when none matches or no hash was ever seen.
   * @throws CivitaiUnavailableError when Civitai can't answer and no hash matched
   */
  async lookup(key: ModelKey): Promise<CivitaiResult> {
    if (!this.models.get(key)) return { outcome: CivitaiOutcome.Missing }
    const hashes = this.hashes.hashesOf(key).slice(0, MAX_HASHES_TRIED)
    const answers = await Promise.allSettled(hashes.map((hash) => this.catalog.versionByHash(hash)))
    const match = answers.find((answer) => answer.status === 'fulfilled' && answer.value !== null)
    if (match?.status === 'fulfilled' && match.value) {
      return this.link(key, match.value.modelId, match.value.versionId)
    }
    const failure = answers.find((answer) => answer.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    return { outcome: CivitaiOutcome.NotFound }
  }

  /**
   * Versions of Civitai models matching the text, those with a file named like the local model
   * first, then in Civitai's order.
   * @throws CivitaiUnavailableError when Civitai can't answer
   */
  async search({ kind, text, identity }: CivitaiSearchParams): Promise<CivitaiCandidate[]> {
    const { models } = await this.catalog.searchModels({ kind, text, limit: SEARCH_MODELS })
    const candidates = models.flatMap((model) =>
      model.versions.map((version): CivitaiCandidate => {
        const fileNames = version.files.map((file) => file.name)
        return {
          modelId: model.id,
          versionId: version.id,
          modelName: model.name,
          versionName: version.name,
          baseModel: version.baseModel,
          creator: model.creator,
          nsfw: model.nsfw,
          downloads: model.downloads,
          thumbsUp: model.thumbsUp,
          fileNames,
          matchesFileName:
            identity !== undefined && fileNames.some((name) => modelIdentity(name) === identity)
        }
      })
    )
    return [
      ...candidates.filter((candidate) => candidate.matchesFileName),
      ...candidates.filter((candidate) => !candidate.matchesFileName)
    ].slice(0, MAX_CIVITAI_CANDIDATES)
  }

  /**
   * Links the model to a Civitai version and stores what Civitai says about it, replacing an
   * earlier link. NotFound when Civitai has no such model or version.
   * @throws CivitaiUnavailableError when Civitai can't answer
   */
  async link(key: ModelKey, modelId: number, versionId: number): Promise<CivitaiResult> {
    if (!this.models.get(key)) return { outcome: CivitaiOutcome.Missing }
    const model = await this.catalog.model(modelId)
    const version = model?.versions.find((candidate) => candidate.id === versionId)
    if (!model || !version) return { outcome: CivitaiOutcome.NotFound }
    this.links.save(key, recordOf(model, version), this.now())
    return this.linked(key)
  }

  /**
   * Fetches the linked version again. NotFound when the model has no link or Civitai dropped it;
   * Unlinked when the model was unlinked (or linked elsewhere) while Civitai was answering, in
   * which case nothing is written: a refresh never brings back a link the user removed.
   * @throws CivitaiUnavailableError when Civitai can't answer
   */
  async refresh(key: ModelKey): Promise<CivitaiResult> {
    if (!this.models.get(key)) return { outcome: CivitaiOutcome.Missing }
    const link = this.links.linkOf(key)
    if (!link) return { outcome: CivitaiOutcome.NotFound }
    const model = await this.catalog.model(link.modelId)
    const version = model?.versions.find((candidate) => candidate.id === link.versionId)
    if (!model || !version) return { outcome: CivitaiOutcome.NotFound }
    if (!this.links.update(key, link.versionId, recordOf(model, version), this.now())) {
      return { outcome: CivitaiOutcome.Unlinked }
    }
    return this.linked(key)
  }

  /** Forgets the link and what was fetched; what the user wrote stays. False when none. */
  unlink(key: ModelKey): boolean {
    return this.links.remove(key)
  }

  private linked(key: ModelKey): CivitaiResult {
    const model = this.models.get(key)
    if (!model) throw new Error(`model ${key.kind}/${key.identity} vanished after being linked`)
    return { outcome: CivitaiOutcome.Linked, model }
  }
}
