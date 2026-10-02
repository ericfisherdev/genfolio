import { modelDisplayName, modelIdentity } from '@domain/model-name'
import type { ModelInfoRepository } from '@domain/repositories'
import { ChangeOutcome } from '@shared/change-outcome'
import type { ModelKind } from '@shared/generation-kinds'
import type {
  ModelChange,
  ModelDetail,
  ModelFields,
  ModelKey,
  ModelList,
  ModelListQuery
} from '@shared/models'

/** Trims a text field, and an empty one is no value. */
const textOrNull = (text: string | null): string | null => text?.trim() || null

/** Trims, drops empties and repeats (compared case-insensitively), keeping the first spelling. */
function cleanWords(words: readonly string[]): string[] {
  const seen = new Set<string>()
  return words
    .map((word) => word.trim())
    .filter((word) => word !== '' && !seen.has(word.toLowerCase()) && seen.add(word.toLowerCase()))
}

const cleanFields = (fields: ModelFields): ModelFields => ({
  baseModel: textOrNull(fields.baseModel),
  triggerWords: cleanWords(fields.triggerWords),
  strength: fields.strength,
  description: textOrNull(fields.description),
  notes: textOrNull(fields.notes)
})

/** What the user records about checkpoints and LoRAs: base model, trigger words, strength, notes. */
export class ModelInfoService {
  constructor(
    private readonly models: ModelInfoRepository,
    private readonly now: () => number
  ) {}

  list(query: ModelListQuery): ModelList {
    return this.models.list(query)
  }

  get(key: ModelKey): ModelDetail | null {
    return this.models.find(key) ?? null
  }

  /** Done, or Missing when no image uses the model and no entry exists for it. */
  save(key: ModelKey, fields: ModelFields): ModelChange {
    if (!this.models.save(key, cleanFields(fields), this.now())) {
      return { outcome: ChangeOutcome.Missing }
    }
    return this.found(key)
  }

  /**
   * Adds a model by name (folders and extension are dropped, so `x.safetensors` is `x`): Done,
   * or Duplicate with the existing one when it already has an entry.
   * @throws RangeError when the name has nothing left once folders and extension are dropped
   */
  create(kind: ModelKind, name: string, fields: ModelFields): ModelChange {
    const key = { kind, identity: modelIdentity(name) }
    if (key.identity === '') throw new RangeError('A model name needs a name before its extension')
    if (this.models.create(key, modelDisplayName(name), cleanFields(fields), this.now())) {
      return this.found(key)
    }
    return { outcome: ChangeOutcome.Duplicate, existing: this.found(key).model }
  }

  /** Forgets what was recorded; false when there was nothing. */
  clear(key: ModelKey): boolean {
    return this.models.clear(key)
  }

  private found(key: ModelKey): { outcome: ChangeOutcome.Done; model: ModelDetail } {
    const model = this.models.find(key)
    if (!model) throw new Error(`model ${key.kind}/${key.identity} vanished after being stored`)
    return { outcome: ChangeOutcome.Done, model }
  }
}
