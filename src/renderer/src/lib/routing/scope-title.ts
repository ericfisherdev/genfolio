import type { DirectoryNode } from '@shared/gallery'
import type { RootSummary } from '@shared/library'
import { folderName } from '../format/folder-name'

export interface DirectoryMatch {
  readonly root: RootSummary
  readonly node: DirectoryNode
}

/** Finds a directory node by id across every root's tree. */
export function findDirectory(
  roots: readonly RootSummary[],
  trees: Readonly<Record<number, DirectoryNode | null>>,
  directoryId: number
): DirectoryMatch | undefined {
  for (const root of roots) {
    const tree = trees[root.id]
    const node = tree ? search(tree, directoryId) : undefined
    if (node) return { root, node }
  }
  return undefined
}

function search(node: DirectoryNode, id: number): DirectoryNode | undefined {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = search(child, id)
    if (found) return found
  }
  return undefined
}

/** Display name of a directory: the root's folder name for a root, else its own name. */
export function directoryTitle(match: DirectoryMatch): string {
  return match.node.relPath === '' ? folderName(match.root.path) : match.node.name
}
