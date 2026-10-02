import { modelIdentity } from '@domain/model-name'
import type { DownloadPlanner, DownloadRecorder, ModelFolderProvider } from '@domain/downloads'
import { CivitaiOutcome } from '@shared/civitai-kinds'
import { ChangeOutcome } from '@shared/change-outcome'
import { EMPTY_MODEL_FIELDS } from '@shared/models'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'

/** Asks the library service what a download needs: its plan, the folders, and where to note it. */
export class ServiceDownloadAdapters
  implements DownloadPlanner, ModelFolderProvider, DownloadRecorder
{
  constructor(private readonly service: ServiceRequester) {}

  plan(modelId: number, versionId: number): ReturnType<DownloadPlanner['plan']> {
    return this.service.request(ServiceMethod.CivitaiDownloadPlan, { modelId, versionId })
  }

  folders(): ReturnType<ModelFolderProvider['folders']> {
    return this.service.request(ServiceMethod.ModelFolders, {})
  }

  /**
   * Adds the downloaded file to the models, linked to the Civitai version it came from, so its
   * trigger words and base model are there to read. A model already listed is linked as it is.
   */
  async record(
    kind: Parameters<DownloadRecorder['record']>[0],
    fileName: string,
    modelId: number,
    versionId: number
  ): Promise<void> {
    const created = await this.service.request(ServiceMethod.ModelsCreate, {
      kind,
      name: fileName,
      fields: EMPTY_MODEL_FIELDS
    })
    if (created.outcome === ChangeOutcome.Missing) throw new Error('the model could not be added')
    const linked = await this.service.request(ServiceMethod.ModelsCivitaiLink, {
      key: { kind, identity: modelIdentity(fileName) },
      modelId,
      versionId
    })
    if (linked.outcome !== CivitaiOutcome.Linked) throw new Error('the model could not be linked')
  }
}
