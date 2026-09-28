<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import type { DirectoryNode } from '@shared/gallery'
  import DirectoryTreeItem from './DirectoryTreeItem.svelte'

  interface Props {
    tree: DirectoryNode
    rootLabel: string
    selectedId: number | undefined
    onselect: (directoryId: number) => void
  }

  let { tree, rootLabel, selectedId, onselect }: Props = $props()

  const expanded = new SvelteSet<number>()
  let focusedId: number | undefined = $state()
  let list: HTMLUListElement | undefined = $state()

  $effect(() => {
    expanded.add(tree.id)
  })

  const effectiveFocus = $derived(focusedId ?? selectedId ?? tree.id)

  function toggle(id: number): void {
    if (expanded.has(id)) expanded.delete(id)
    else expanded.add(id)
  }

  const items = (): HTMLElement[] =>
    Array.from(list?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])

  const idOf = (item: HTMLElement | null | undefined): number | undefined =>
    item?.dataset['nodeId'] === undefined ? undefined : Number(item.dataset['nodeId'])

  function focusItem(item: HTMLElement | undefined): void {
    const id = idOf(item)
    if (item && id !== undefined) {
      focusedId = id
      item.focus()
    }
  }

  function onkeydown(event: KeyboardEvent): void {
    const current = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]')
    const id = idOf(current)
    if (!current || id === undefined) return
    const all = items()
    const index = all.indexOf(current)
    const isExpandable = current.getAttribute('aria-expanded') !== null
    const isOpen = current.getAttribute('aria-expanded') === 'true'
    switch (event.key) {
      case 'ArrowDown':
        focusItem(all[index + 1])
        break
      case 'ArrowUp':
        focusItem(all[index - 1])
        break
      case 'Home':
        focusItem(all[0])
        break
      case 'End':
        focusItem(all[all.length - 1])
        break
      case 'ArrowRight':
        if (isExpandable && !isOpen) toggle(id)
        else if (isOpen) focusItem(all[index + 1])
        break
      case 'ArrowLeft':
        if (isOpen) toggle(id)
        else
          focusItem(current.parentElement?.closest<HTMLElement>('[role="treeitem"]') ?? undefined)
        break
      default:
        return
    }
    event.preventDefault()
  }
</script>

<ul bind:this={list} role="tree" aria-label={`Folders in ${rootLabel}`} {onkeydown}>
  <DirectoryTreeItem
    node={tree}
    label={rootLabel}
    {expanded}
    {selectedId}
    focusedId={effectiveFocus}
    ontoggle={toggle}
    {onselect}
    onfocusitem={(id) => (focusedId = id)}
  />
</ul>

<style>
  ul {
    margin: 0;
    padding: 0;
  }
</style>
