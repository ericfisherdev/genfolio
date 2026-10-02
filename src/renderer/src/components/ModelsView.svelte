<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import { ModelKind } from '@shared/generation-kinds'
  import { EMPTY_MODEL_FIELDS } from '@shared/models'
  import { getAppServices } from '../lib/app-context'
  import ModelDetailPanel from './ModelDetailPanel.svelte'
  import ModelForm, { type ModelDraft } from './ModelForm.svelte'

  const { models } = getAppServices()
  const count = new Intl.NumberFormat()
  const SEARCH_DELAY_MS = 250

  let adding = $state(false)
  let search = $state(models.text)
  let searchTimer: ReturnType<typeof setTimeout> | undefined

  // load() reads the list it replaces, so it must not be tracked or it would re-run itself.
  $effect(() => {
    untrack(() => void models.load())
  })
  onDestroy(() => clearTimeout(searchTimer))

  function onsearchinput(): void {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => void models.filter({ text: search }), SEARCH_DELAY_MS)
  }

  const isSelected = (kind: ModelKind, identity: string): boolean =>
    models.selected?.kind === kind && models.selected.identity === identity

  async function add(draft: ModelDraft): Promise<void> {
    if (await models.create(draft.kind, draft.name, draft.fields)) adding = false
  }

  const kindLabel = (kind: ModelKind): string => (kind === ModelKind.Lora ? 'LoRA' : 'Checkpoint')
</script>

<section class="models" aria-labelledby="models-title">
  <header class="toolbar" role="search" aria-label="Filter models">
    <h1 id="models-title">Models</h1>
    <input
      type="search"
      placeholder="Search name, base model, trigger words…"
      aria-label="Search models"
      bind:value={search}
      oninput={onsearchinput}
    />
    <select
      aria-label="Type"
      value={models.kind ?? ''}
      onchange={(event) =>
        void models.filter({ kind: (event.currentTarget.value as ModelKind) || undefined })}
    >
      <option value="">Checkpoints and LoRAs</option>
      <option value={ModelKind.Checkpoint}>Checkpoints</option>
      <option value={ModelKind.Lora}>LoRAs</option>
    </select>
    <select
      aria-label="Base model"
      value={models.baseModel ?? ''}
      onchange={(event) =>
        void models.filter({ baseModel: event.currentTarget.value || undefined })}
    >
      <option value="">Any base model</option>
      {#each models.baseModels as base (base)}
        <option value={base}>{base}</option>
      {/each}
    </select>
    <button
      type="button"
      class="chip-toggle"
      aria-pressed={models.withoutInfo}
      onclick={() => void models.filter({ withoutInfo: !models.withoutInfo })}>No info yet</button
    >
    <button
      type="button"
      class="add"
      onclick={() => {
        adding = true
        void models.select(undefined)
      }}>+ Add model</button
    >
  </header>

  <div class="panes">
    <div class="list">
      {#if models.loaded && models.items.length === 0}
        <p class="empty">
          {models.total === 0 &&
          !models.text &&
          !models.kind &&
          !models.baseModel &&
          !models.withoutInfo
            ? 'No models yet. Models appear once the library has images made with them, or add one.'
            : 'No models match.'}
        </p>
      {:else}
        <p class="summary">{count.format(models.total)} models</p>
        <ul aria-label="Models">
          {#each models.items as item (`${item.kind}/${item.identity}`)}
            <li>
              <button
                type="button"
                aria-pressed={isSelected(item.kind, item.identity)}
                onclick={() => {
                  adding = false
                  void models.select({ kind: item.kind, identity: item.identity })
                }}
              >
                <span class="name">{item.name}</span>
                <span class="sub">
                  {kindLabel(item.kind)}{item.baseModel ? ` · ${item.baseModel}` : ''}{item.hasInfo
                    ? ''
                    : ' · no info'}
                </span>
              </button>
            </li>
          {/each}
        </ul>
        {#if models.items.length < models.total}
          <button type="button" class="more" onclick={() => void models.loadMore()}>
            Show more
          </button>
        {/if}
      {/if}
    </div>

    <div class="detail">
      {#if adding}
        <h2>Add a model</h2>
        <ModelForm
          adding
          initial={EMPTY_MODEL_FIELDS}
          baseModels={models.baseModels}
          onsubmit={(draft) => void add(draft)}
          oncancel={() => (adding = false)}
        />
      {:else if models.detail}
        <ModelDetailPanel model={models.detail} />
      {:else}
        <p class="empty">Choose a model to see or record its base model and trigger words.</p>
      {/if}
    </div>
  </div>
</section>

<style>
  .models {
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
    min-width: 220px;
    max-width: 420px;
  }
  input,
  select {
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: inherit;
  }
  .chip-toggle,
  .add,
  .more {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    color: inherit;
  }
  .chip-toggle[aria-pressed='true'] {
    background: var(--color-selected);
    border-color: var(--color-accent);
  }
  .add {
    margin-left: auto;
    color: var(--color-accent);
    font-weight: 600;
  }
  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(260px, 380px) 1fr;
  }
  .list {
    overflow-y: auto;
    padding: var(--space-3);
    border-right: 1px solid var(--color-border);
  }
  .detail {
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
  }
  .summary {
    margin: 0 0 var(--space-2);
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    background: none;
    border: none;
    border-radius: var(--radius-1);
    padding: var(--space-2);
    cursor: pointer;
    text-align: left;
    color: inherit;
  }
  li button:hover {
    background: var(--color-surface-raised);
  }
  li button[aria-pressed='true'] {
    background: var(--color-selected);
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .sub {
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }
  .empty {
    color: var(--color-text-muted);
    margin: 0;
  }
  .more {
    margin-top: var(--space-3);
  }
  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1.2rem;
  }
</style>
