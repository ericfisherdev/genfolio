<script lang="ts">
  import type { DirectoryNode } from '@shared/gallery'
  import Self from './DirectoryTreeItem.svelte'

  interface Props {
    node: DirectoryNode
    label: string
    expanded: ReadonlySet<number>
    selectedId: number | undefined
    focusedId: number | undefined
    ontoggle: (id: number) => void
    onselect: (id: number) => void
    onfocusitem: (id: number) => void
  }

  let { node, label, expanded, selectedId, focusedId, ontoggle, onselect, onfocusitem }: Props =
    $props()

  const hasChildren = $derived(node.children.length > 0)
  const isExpanded = $derived(expanded.has(node.id))
  const count = new Intl.NumberFormat()
</script>

<li
  role="treeitem"
  aria-label={`${label}, ${count.format(node.totalImageCount)} images`}
  aria-expanded={hasChildren ? isExpanded : undefined}
  aria-selected={selectedId === node.id}
  tabindex={focusedId === node.id ? 0 : -1}
  data-node-id={node.id}
  onfocus={(event) => {
    if (event.target === event.currentTarget) onfocusitem(node.id)
  }}
  onkeydown={(event) => {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    event.stopPropagation()
    onselect(node.id)
  }}
  onclick={(event) => {
    event.stopPropagation()
    if (hasChildren && (event.target as HTMLElement).closest('.toggle')) ontoggle(node.id)
    else onselect(node.id)
  }}
>
  <div class="row" class:selected={selectedId === node.id}>
    <span class="toggle" aria-hidden="true">{hasChildren ? (isExpanded ? '▾' : '▸') : ''}</span>
    <span class="name" title={node.relPath || label}>{label}</span>
    <span class="count" aria-hidden="true">{count.format(node.totalImageCount)}</span>
  </div>
  {#if hasChildren && isExpanded}
    <ul role="group">
      {#each node.children as child (child.id)}
        <Self
          node={child}
          label={child.name}
          {expanded}
          {selectedId}
          {focusedId}
          {ontoggle}
          {onselect}
          {onfocusitem}
        />
      {/each}
    </ul>
  {/if}
</li>

<style>
  li {
    list-style: none;
    outline: none;
  }
  li:focus-visible > .row {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }
  ul {
    margin: 0;
    padding-left: var(--space-3);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 3px var(--space-2);
    border-radius: var(--radius-1);
    cursor: pointer;
  }
  .row:hover {
    background: var(--color-surface-raised);
  }
  .row.selected {
    background: var(--color-selected);
  }
  .toggle {
    width: 1em;
    text-align: center;
    color: var(--color-text-muted);
  }
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }
</style>
