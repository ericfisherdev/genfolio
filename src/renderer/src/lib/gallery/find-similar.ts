import type { GenerationDetails, GenerationResource } from '@shared/generation'
import { ResourceKind } from '@shared/generation-kinds'
import { KeywordScope, SetMatchMode } from '@shared/search-kinds'
import type { SearchFilters } from '@shared/search'

/** What the detail page can look for across the library. */
export enum FindKind {
  Resource = 'resource',
  SameSeed = 'same-seed',
  SamePrompt = 'same-prompt',
  Keywords = 'keywords'
}

export type FindSimilar =
  | { readonly kind: FindKind.Resource; readonly resource: GenerationResource }
  | { readonly kind: FindKind.SameSeed }
  | { readonly kind: FindKind.SamePrompt }
  | { readonly kind: FindKind.Keywords; readonly text: string }

/**
 * The filters that find images like this one, or `undefined` when there is nothing to look
 * for (a resource that isn't stored, a missing seed, text without words).
 */
export function filtersToFind(
  find: FindSimilar,
  imageId: number,
  details: GenerationDetails
): SearchFilters | undefined {
  switch (find.kind) {
    case FindKind.Resource: {
      const id = find.resource.modelId
      if (id === null) return undefined
      return find.resource.kind === ResourceKind.Lora
        ? { loras: { ids: [id], mode: SetMatchMode.Any } }
        : { checkpointIds: [id] }
    }
    case FindKind.SameSeed:
      return details.seed ? { seed: details.seed } : undefined
    case FindKind.SamePrompt:
      return { samePromptAs: imageId }
    case FindKind.Keywords: {
      // Searched as one phrase; quotes inside would end it early.
      const phrase = find.text.replaceAll('"', ' ').replace(/\s+/g, ' ').trim()
      return phrase
        ? { keywords: { query: `"${phrase}"`, scope: KeywordScope.Positive } }
        : undefined
    }
  }
}
