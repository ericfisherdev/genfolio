<script lang="ts">
  import { untrack } from 'svelte'
  import { MAX_TAG_NAME } from '@shared/tag-kinds'
  import type { Tag } from '@shared/tags'
  import { getAppServices } from '../lib/app-context'
  import NameCombobox from './NameCombobox.svelte'

  interface Props {
    imageId: number
  }

  let { imageId }: Props = $props()
  const { api, tags } = getAppServices()
  let imageTags: readonly Tag[] = $state.raw([])
  let loadedFor = 0

  /** Loads the image's tags; a response for an image no longer shown is ignored. */
  async function load(id: number): Promise<void> {
    loadedFor = id
    try {
      const loaded = await api.getImageTags(id)
      if (loadedFor === id) imageTags = loaded
    } catch {
      if (loadedFor === id) imageTags = []
    }
  }

  // Reload for a new image, and when the library's tags change (renamed, merged, deleted).
  $effect(() => {
    const id = imageId
    void tags.tags
    untrack(() => void load(id))
  })

  async function add(choice: Tag | string): Promise<void> {
    const id = imageId
    const tag = typeof choice === 'string' ? await tags.ensure(choice) : choice
    if (tag) await tags.apply([tag], [id])
  }

  async function remove(tag: Tag): Promise<void> {
    await tags.remove([tag], [imageId])
  }
</script>

<section class="tags" aria-labelledby="tags-heading">
  <h2 id="tags-heading">Tags</h2>
  {#if imageTags.length > 0}
    <ul class="chips" aria-label="Tags of this image">
      {#each imageTags as tag (tag.id)}
        <li>
          <span>{tag.name}</span>
          <button type="button" aria-label={`Remove tag ${tag.name}`} onclick={() => remove(tag)}
            >✕</button
          >
        </li>
      {/each}
    </ul>
  {/if}
  <NameCombobox
    items={tags.tags}
    excluded={imageTags.map((tag) => tag.id)}
    onpick={(choice) => void add(choice)}
    maxName={MAX_TAG_NAME}
    label="Add a tag"
    listLabel="Tags"
  />
</section>

<style>
  .tags {
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: 0 0 var(--space-2);
    padding: 0;
    list-style: none;
  }
  .chips li {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-1) 0 var(--space-2);
    background: var(--color-selected);
    border-radius: 999px;
  }
  .chips button {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }
</style>
