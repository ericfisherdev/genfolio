<script lang="ts">
  import { SetMatchMode } from '@shared/search-kinds'
  import { MAX_TAG_NAME } from '@shared/tag-kinds'
  import type { Tag } from '@shared/tags'
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'
  import ActionMenu from './ActionMenu.svelte'
  import ChoiceDialog from './ChoiceDialog.svelte'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import PromptDialog from './PromptDialog.svelte'

  const { tags, router } = getAppServices()
  const count = new Intl.NumberFormat()

  let renaming: Tag | undefined = $state()
  let merging: Tag | undefined = $state()
  let deleting: Tag | undefined = $state()

  const mergeTargets = $derived(
    tags.tags
      .filter((tag) => tag.id !== merging?.id)
      .map((tag) => ({ value: tag.id, label: tag.name }))
  )

  const show = (tag: Tag): void =>
    router.navigate({
      kind: RouteKind.All,
      filters: { tags: { ids: [tag.id], mode: SetMatchMode.Any } }
    })

  async function rename(name: string): Promise<void> {
    const tag = renaming
    renaming = undefined
    if (tag) await tags.rename(tag, name)
  }

  async function merge(intoId: number): Promise<void> {
    const from = merging
    merging = undefined
    const into = tags.tags.find((tag) => tag.id === intoId)
    if (from && into) await tags.merge(from, into)
  }

  async function remove(): Promise<void> {
    const tag = deleting
    deleting = undefined
    if (tag) await tags.delete(tag)
  }
</script>

{#if tags.tags.length > 0}
  <h2>Tags</h2>
  <ul class="tags" aria-label="Tags">
    {#each tags.tags as tag (tag.id)}
      <li>
        <button type="button" class="tag" onclick={() => show(tag)}>
          <span class="name">{tag.name}</span>
          <span class="count">{count.format(tag.imageCount)}</span>
        </button>
        <ActionMenu
          label={`Actions for tag ${tag.name}`}
          actions={[
            { label: 'Rename…', onselect: () => (renaming = tag) },
            ...(tags.tags.length > 1
              ? [{ label: 'Merge into…', onselect: () => (merging = tag) }]
              : []),
            { label: 'Delete…', onselect: () => (deleting = tag) }
          ]}
        />
      </li>
    {/each}
  </ul>
{/if}

<PromptDialog
  open={renaming !== undefined}
  title="Rename tag"
  label="Name"
  initial={renaming?.name ?? ''}
  confirmLabel="Rename"
  maxlength={MAX_TAG_NAME}
  onconfirm={(name) => void rename(name)}
  oncancel={() => (renaming = undefined)}
/>

<ChoiceDialog
  open={merging !== undefined}
  title={`Merge “${merging?.name ?? ''}” into another tag`}
  message="Every image with this tag gets the chosen tag instead, and this tag is deleted."
  label="Merge into"
  options={mergeTargets}
  confirmLabel="Merge"
  onconfirm={(id) => void merge(id)}
  oncancel={() => (merging = undefined)}
/>

<ConfirmDialog
  open={deleting !== undefined}
  title={`Delete the tag “${deleting?.name ?? ''}”?`}
  message="It is removed from every image that has it. The images themselves are not affected."
  confirmLabel="Delete"
  onconfirm={() => void remove()}
  oncancel={() => (deleting = undefined)}
/>

<style>
  h2 {
    margin: var(--space-3) 0 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }
  .tags {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
  }
  .tag {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    background: none;
    border: none;
    border-radius: var(--radius-1);
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .tag:hover {
    background: var(--color-surface-raised);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    color: var(--color-text-muted);
  }
</style>
