import { describe, expect, it } from 'vitest'
import type { GenerationDetails, GenerationResource } from '@shared/generation'
import { ResourceKind } from '@shared/generation-kinds'
import { KeywordScope, SetMatchMode } from '@shared/search-kinds'
import { filtersToFind, FindKind } from './find-similar'

const resource = (kind: ResourceKind, modelId: number | null): GenerationResource => ({
  kind,
  modelId,
  name: 'x',
  hash: null,
  weight: null,
  weightSource: null
})
const details = { seed: '42' } as GenerationDetails

describe('filtersToFind', () => {
  it('filters by the picked model, a refiner counting as a checkpoint', () => {
    expect(
      filtersToFind(
        { kind: FindKind.Resource, resource: resource(ResourceKind.Lora, 3) },
        1,
        details
      )
    ).toEqual({
      loras: { ids: [3], mode: SetMatchMode.Any }
    })
    expect(
      filtersToFind(
        { kind: FindKind.Resource, resource: resource(ResourceKind.Refiner, 4) },
        1,
        details
      )
    ).toEqual({
      checkpointIds: [4]
    })
    expect(
      filtersToFind(
        { kind: FindKind.Resource, resource: resource(ResourceKind.Checkpoint, null) },
        1,
        details
      )
    ).toBeUndefined()
  })

  it('filters by seed, prompt and selected text as one phrase', () => {
    expect(filtersToFind({ kind: FindKind.SameSeed }, 1, details)).toEqual({ seed: '42' })
    expect(
      filtersToFind({ kind: FindKind.SameSeed }, 1, { seed: null } as GenerationDetails)
    ).toBeUndefined()
    expect(filtersToFind({ kind: FindKind.SamePrompt }, 7, details)).toEqual({ samePromptAs: 7 })
    expect(
      filtersToFind({ kind: FindKind.Keywords, text: 'red  "hair"\n girl' }, 1, details)
    ).toEqual({
      keywords: { query: '"red hair girl"', scope: KeywordScope.Positive }
    })
    expect(filtersToFind({ kind: FindKind.Keywords, text: ' " ' }, 1, details)).toBeUndefined()
  })
})
