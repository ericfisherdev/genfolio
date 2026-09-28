import type { LoraUse } from '@domain/generation'
import { modelDisplayName, modelIdentity, normalizeHash } from '@domain/model-name'

interface LoraFacts {
  readonly weight?: number | undefined
  readonly hash?: string | undefined
}

/**
 * Gathers LoRA mentions from several places into one list, one entry per model. Call `add` in
 * precedence order: the first source to give a weight or hash for a LoRA wins it.
 */
export class LoraCollector {
  private readonly byIdentity = new Map<
    string,
    { name: string; weight: number | null; hash: string | null }
  >()

  add(rawName: string, facts: LoraFacts): void {
    const name = modelDisplayName(rawName)
    if (!name) return
    const identity = modelIdentity(name)
    const entry = this.byIdentity.get(identity) ?? { name, weight: null, hash: null }
    entry.weight ??= facts.weight ?? null
    entry.hash ??= normalizeHash(facts.hash)
    this.byIdentity.set(identity, entry)
  }

  /** The collected LoRAs in first-mention order, or `undefined` when there are none. */
  result(): LoraUse[] | undefined {
    return this.byIdentity.size > 0 ? [...this.byIdentity.values()] : undefined
  }
}
