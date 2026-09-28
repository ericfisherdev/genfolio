import { HashKind } from '@shared/generation-kinds'

const MODEL_EXTENSION = /\.(safetensors|ckpt|pt|pth|bin)$/i
const HEX = /^[0-9a-f]+$/

/** A model file reference without folders or extension: `loras/detail/x.safetensors` → `x`. */
export function modelDisplayName(raw: string): string {
  const base = raw.trim().split(/[/\\]/).pop() ?? ''
  return base.replace(MODEL_EXTENSION, '').trim()
}

/** The key two references to the same model share, whatever their folder, extension or case. */
export function modelIdentity(raw: string): string {
  return modelDisplayName(raw).toLowerCase()
}

/** A hash in canonical form (lowercase hex), or `null` when it isn't one. */
export function normalizeHash(raw: string | undefined): string | null {
  const hash = raw?.trim().toLowerCase() ?? ''
  return HEX.test(hash) ? hash : null
}

const KIND_BY_LENGTH = new Map([
  [10, HashKind.AutoV2],
  [12, HashKind.A1111Lora],
  [8, HashKind.AutoV1]
])

export function hashKindOf(hash: string): HashKind {
  return KIND_BY_LENGTH.get(hash.length) ?? HashKind.Unknown
}
