<script lang="ts">
  import { untrack } from 'svelte'
  import { COMMON_BASE_MODELS } from '@shared/civitai-kinds'
  import { ModelKind } from '@shared/generation-kinds'
  import { getAppServices } from '../lib/app-context'
  import CivitaiResultCard from './CivitaiResultCard.svelte'
  import DownloadsPanel from './DownloadsPanel.svelte'

  const { civitaiBrowse: browse, modelFolders, models } = getAppServices()

  // The first visit lists the most downloaded; coming back keeps the earlier results.
  $effect(() => {
    untrack(() => {
      void modelFolders.load()
      void models.load()
      if (!browse.searched) void browse.search()
    })
  })

  const baseModels = $derived([...new Set([...COMMON_BASE_MODELS, ...models.baseModels])])

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    void browse.search()
  }
</script>

<section class="browse" aria-labelledby="civitai-title">
  <form class="toolbar" role="search" aria-label="Search Civitai" onsubmit={submit}>
    <h1 id="civitai-title">Get models</h1>
    <select
      aria-label="Type"
      value={browse.kind}
      onchange={(event) => void browse.setKind(event.currentTarget.value as ModelKind)}
    >
      <option value={ModelKind.Lora}>LoRAs</option>
      <option value={ModelKind.Checkpoint}>Checkpoints</option>
    </select>
    <input
      type="search"
      aria-label="Search by name"
      placeholder="Search by name…"
      bind:value={browse.text}
    />
    <input
      type="text"
      aria-label="Base model"
      placeholder="Any base model"
      list="civitai-base-models"
      bind:value={browse.baseModel}
    />
    <datalist id="civitai-base-models">
      {#each baseModels as base (base)}
        <option value={base}></option>
      {/each}
    </datalist>
    <button type="submit" class="primary" disabled={browse.loading}>
      {browse.loading ? 'Searching…' : 'Search'}
    </button>
  </form>

  <p class="note">
    Searching and downloading contact civitai.com. Downloads are saved by base model in the folders
    set in Settings.
  </p>

  <div class="results">
    {#if browse.searched && browse.items.length === 0}
      <p class="empty">Nothing found. Try another name or base model.</p>
    {:else}
      <ul aria-label="Civitai models">
        {#each browse.items as item (item.modelId)}
          <li><CivitaiResultCard {item} kind={browse.kind} /></li>
        {/each}
      </ul>
      {#if browse.nextCursor !== null}
        <button
          type="button"
          class="more"
          disabled={browse.loading}
          onclick={() => void browse.loadMore()}
        >
          {browse.loading ? 'Loading…' : 'Show more'}
        </button>
      {/if}
    {/if}
  </div>

  <DownloadsPanel />
</section>

<style>
  .browse {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }
  h1 {
    margin: 0 var(--space-3) 0 0;
    font-size: 1.2rem;
  }
  input[type='search'] {
    flex: 1;
    min-width: 200px;
    max-width: 380px;
  }
  input,
  select {
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: inherit;
  }
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    color: inherit;
  }
  .primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-contrast);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .note {
    margin: 0;
    padding: var(--space-2) var(--space-5);
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }
  .results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-2) var(--space-5) var(--space-4);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    /* min() lets a column shrink below 340px, and minmax(0, …) keeps a long version name or
       path from widening its column past the window. */
    grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
    gap: var(--space-3);
  }
  li {
    display: flex;
    min-width: 0;
  }
  .empty {
    color: var(--color-text-muted);
  }
  .more {
    margin-top: var(--space-3);
    border-radius: 999px;
  }
</style>
