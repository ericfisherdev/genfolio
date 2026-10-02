import type { CivitaiCatalog } from '@domain/civitai'
import { modelFileOf, safeModelFileName } from '@domain/model-file'
import {
  BROWSE_PAGE_SIZE,
  type CivitaiBrowseItem,
  type CivitaiBrowsePage,
  type CivitaiBrowseQuery,
  type DownloadPlan
} from '@shared/civitai-browse'

const SHA256 = /^[0-9a-f]{64}$/

/** Where Civitai serves a version's files from; the only host a download may start at. */
export const CIVITAI_DOWNLOAD_HOST = 'civitai.com'

const canonicalDownloadUrl = (versionId: number): string =>
  `https://${CIVITAI_DOWNLOAD_HOST}/api/download/models/${versionId}`

/** What a Civitai file's download link says, if it is one on Civitai's own host. */
function civitaiUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === CIVITAI_DOWNLOAD_HOST ? url : null
  } catch {
    return null
  }
}

/** Finds models on Civitai to download, and says exactly what downloading a version would fetch. */
export class CivitaiBrowseService {
  constructor(private readonly catalog: CivitaiCatalog) {}

  /**
   * A page of models of one kind, narrowed by name and base model. Models with no version that has
   * a model file to download are left out.
   * @throws CivitaiUnavailableError when Civitai can't answer
   */
  async browse(query: CivitaiBrowseQuery): Promise<CivitaiBrowsePage> {
    const page = await this.catalog.searchModels({
      kind: query.kind,
      ...(query.text ? { text: query.text } : {}),
      ...(query.baseModel ? { baseModel: query.baseModel } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: BROWSE_PAGE_SIZE
    })
    const items = page.models
      .map((model): CivitaiBrowseItem => ({
        modelId: model.id,
        name: model.name,
        creator: model.creator,
        nsfw: model.nsfw,
        downloads: model.downloads,
        thumbsUp: model.thumbsUp,
        tags: model.tags,
        versions: model.versions.map((version) => {
          const file = modelFileOf(version)
          return {
            versionId: version.id,
            name: version.name,
            baseModel: version.baseModel,
            publishedAt: version.publishedAt,
            trainedWords: version.trainedWords,
            fileName: file ? safeModelFileName(file.name) : null,
            sizeKb: file?.sizeKb ?? null
          }
        })
      }))
      .filter((item) => item.versions.some((version) => version.fileName !== null))
    return { items, nextCursor: page.nextCursor }
  }

  /**
   * The file to fetch for a version. Null when Civitai has no such model or version, or it has no
   * model file. The address is Civitai's own, whatever the reply says.
   * @throws CivitaiUnavailableError when Civitai can't answer
   */
  async planDownload(modelId: number, versionId: number): Promise<DownloadPlan | null> {
    const model = await this.catalog.model(modelId)
    const version = model?.versions.find((candidate) => candidate.id === versionId)
    const file = version && modelFileOf(version)
    const fileName = file && safeModelFileName(file.name)
    if (!model || !version || !file || !fileName) return null
    const sha256 = file.hashes['SHA256']?.toLowerCase()
    return {
      fileName,
      sizeKb: file.sizeKb,
      sha256: sha256 && SHA256.test(sha256) ? sha256 : null,
      downloadUrl: civitaiUrl(file.downloadUrl) ?? canonicalDownloadUrl(version.id),
      baseModel: version.baseModel,
      modelName: model.name,
      versionName: version.name
    }
  }
}
