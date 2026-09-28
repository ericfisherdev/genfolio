import { describe, expect, it } from 'vitest'
import { GeneratorKind } from '@shared/generation-kinds'
import { generatorFromVersion } from './generator-version'

describe('generatorFromVersion', () => {
  it.each([
    ['FwdFooocus v2026.09.7', GeneratorKind.FwdFooocus],
    ['Fooocus v2.5.5', GeneratorKind.Fooocus],
    ['UnFooocused v1.0', GeneratorKind.UnFooocused],
    ['v1.10.1', GeneratorKind.A1111],
    [undefined, GeneratorKind.A1111]
  ])('%s is %s', (version, kind) => {
    expect(generatorFromVersion(version, GeneratorKind.A1111)).toBe(kind)
  })
})
