import type { SelectionState } from '../state/selection.svelte'

/** What a card's action applies to: the whole selection when the card is part of it. */
export function actionTargets(
  selection: Pick<SelectionState, 'has' | 'list'>,
  imageId: number
): number[] {
  return selection.has(imageId) ? selection.list() : [imageId]
}
