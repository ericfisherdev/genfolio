<script lang="ts">
  import { MAX_TAG_NAME } from '@shared/tag-kinds'
  import type { ModelKey } from '@shared/models'
  import type { ModelTag, ModelTagRef } from '@shared/model-tags'
  import { getAppServices } from '../lib/app-context'
  import NameCombobox from './NameCombobox.svelte'

  interface Props {
    /** The model whose tags are shown and edited. */
    model: ModelKey & { readonly tags: readonly ModelTagRef[] }
  }

  let { model }: Props = $props()
  const { modelTags } = getAppServices()

  const key = $derived({ kind: model.kind, identity: model.identity })

  async function add(choice: ModelTag | string): Promise<void> {
    const target = key
    const tag = typeof choice === 'string' ? await modelTags.ensure(choice) : choice
    if (tag) await modelTags.apply(tag, target)
  }

  async function remove(tag: ModelTagRef): Promise<void> {
    await modelTags.remove(tag, key)
  }
</script>

<section class="tags" aria-label="Model tags">
  <h3>Tags</h3>
  {#if model.tags.length > 0}
    <ul class="chips" aria-label="Tags of this model">
      {#each model.tags as tag (tag.id)}
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
    items={modelTags.tags}
    excluded={model.tags.map((tag) => tag.id)}
    onpick={(choice) => void add(choice)}
    countOf={(tag) => tag.modelCount}
    maxName={MAX_TAG_NAME}
    label="Add a model tag"
    listLabel="Model tags"
  />
</section>

<style>
  .tags {
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }
  h3 {
    margin: 0 0 var(--space-2);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
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
    overflow-wrap: anywhere;
  }
  .chips button {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }
</style>
