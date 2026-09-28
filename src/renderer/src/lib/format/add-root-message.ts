import type { AddRootViaDialogResult } from '@shared/library'
import { AddRootOutcome } from '@shared/library-kinds'

/** What to tell the user after "Add folder"; undefined when there is nothing to say. */
export function addRootMessage(result: AddRootViaDialogResult): string | undefined {
  switch (result.outcome) {
    case AddRootOutcome.Added:
      return result.absorbedRoots > 0
        ? `Added ${result.root.path} and merged ${result.absorbedRoots} folder${result.absorbedRoots === 1 ? '' : 's'} already in the library.`
        : undefined
    case AddRootOutcome.Cancelled:
      return undefined
    case AddRootOutcome.AlreadyAdded:
      return `${result.path} is already in the library.`
    case AddRootOutcome.InsideExistingRoot:
      return `That folder is already included in ${result.path}.`
    case AddRootOutcome.NotADirectory:
      return `${result.path} is not a folder that can be added.`
  }
}
