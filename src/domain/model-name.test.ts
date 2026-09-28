import { describe, expect, it } from 'vitest'
import { HashKind } from '@shared/generation-kinds'
import { hashKindOf, modelDisplayName, modelIdentity, normalizeHash } from './model-name'

describe('model names', () => {
  it.each([
    ['add-detail-xl', 'add-detail-xl'],
    ['loras/detail/Add-Detail-XL.safetensors', 'Add-Detail-XL'],
    ['C:\\models\\x.ckpt', 'x'],
    ['v1.5-pruned.pt', 'v1.5-pruned'],
    ['name.with.dots', 'name.with.dots']
  ])('%s displays as %s', (raw, display) => {
    expect(modelDisplayName(raw)).toBe(display)
  })

  it('shares an identity across folder, extension and case', () => {
    expect(modelIdentity('loras/Add-Detail-XL.safetensors')).toBe(modelIdentity('add-detail-xl'))
  })
})

describe('hashes', () => {
  it('normalizes hex and rejects anything else', () => {
    expect(normalizeHash(' C69E98FA77 ')).toBe('c69e98fa77')
    expect(normalizeHash('not-hex')).toBeNull()
    expect(normalizeHash(undefined)).toBeNull()
  })

  it.each([
    ['c69e98fa77', HashKind.AutoV2],
    ['0123456789ab', HashKind.A1111Lora],
    ['45dee52b', HashKind.AutoV1],
    ['abc', HashKind.Unknown]
  ])('%s is %s', (hash, kind) => {
    expect(hashKindOf(hash)).toBe(kind)
  })
})
