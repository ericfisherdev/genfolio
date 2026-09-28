import { GeneratorKind } from '@shared/generation-kinds'

const BY_PREFIX: readonly [RegExp, GeneratorKind][] = [
  [/^fwdfooocus\b/i, GeneratorKind.FwdFooocus],
  [/^unfooocused\b/i, GeneratorKind.UnFooocused],
  [/^fooocus\b/i, GeneratorKind.Fooocus]
]

/** The generator a `Version`/`Software` string names, or `fallback` when it names none we know. */
export function generatorFromVersion(
  version: string | undefined,
  fallback: GeneratorKind
): GeneratorKind {
  const text = version?.trim() ?? ''
  return BY_PREFIX.find(([prefix]) => prefix.test(text))?.[1] ?? fallback
}
