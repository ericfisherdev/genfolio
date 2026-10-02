<script lang="ts">
  import { CivitaiOutcome, type CivitaiCandidate } from '@shared/civitai'
  import { ModelKind } from '@shared/generation-kinds'
  import type { ModelDetail } from '@shared/models'
  import { getAppServices } from '../lib/app-context'
  import CivitaiSearchDialog from './CivitaiSearchDialog.svelte'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import ModelForm, { type ModelDraft } from './ModelForm.svelte'

  interface Props {
    model: ModelDetail
  }

  let { model }: Props = $props()
  const { models } = getAppServices()
  const count = new Intl.NumberFormat()

  let editing = $state(false)
  let confirmingClear = $state(false)
  let searching = $state(false)

  // A different model starts in view mode, not in the previous model's form or dialog.
  $effect(() => {
    void model.kind
    void model.identity
    editing = false
    searching = false
  })

  const key = $derived({ kind: model.kind, identity: model.identity })
  const kindLabel = $derived(model.kind === ModelKind.Lora ? 'LoRA' : 'Checkpoint')
  const civitai = $derived(model.civitai)
  const hasOwnInfo = $derived(
    model.custom.baseModel !== null ||
      model.custom.triggerWords.length > 0 ||
      model.custom.strength !== null ||
      model.custom.description !== null ||
      model.custom.notes !== null
  )

  async function save(draft: ModelDraft): Promise<void> {
    if (await models.save(key, draft.fields)) editing = false
  }

  async function clear(): Promise<void> {
    confirmingClear = false
    await models.clear(key)
  }

  /** An exact match by file hash; with none, the search takes over. */
  async function lookup(): Promise<void> {
    if ((await models.lookupOnCivitai(key)) === CivitaiOutcome.NotFound) searching = true
  }

  const link = (candidate: CivitaiCandidate): Promise<boolean> =>
    models.linkToCivitai(key, candidate)
</script>

<article aria-label={`${model.name} details`}>
  <header>
    <h2>{model.name}</h2>
    <p class="meta">
      {kindLabel} · {model.imageCount === 0
        ? 'not used by any image'
        : `${count.format(model.imageCount)} image${model.imageCount === 1 ? '' : 's'}`}
    </p>
  </header>

  <dl class="summary">
    <dt>Base model</dt>
    <dd>{model.baseModel ?? '—'}</dd>
    <dt>Strength</dt>
    <dd>{model.strength ?? '—'}</dd>
    <dt>Trigger words</dt>
    <dd>
      {#if model.triggerWords.length === 0}
        —
      {:else}
        <ul class="words" aria-label="Trigger words">
          {#each model.triggerWords as word (word)}
            <li>{word}</li>
          {/each}
        </ul>
        <button type="button" onclick={() => void models.copyTriggerWords(key)}>
          Copy trigger words
        </button>
      {/if}
    </dd>
  </dl>

  <section class="block" aria-label="Civitai">
    <h3>Civitai</h3>
    {#if civitai}
      <p class="linked">
        <strong>{civitai.modelName}</strong> · {civitai.versionName}
        {#if civitai.nsfw}<span class="badge">NSFW</span>{/if}
      </p>
      <p class="meta">
        {civitai.baseModel ?? 'unknown base model'}{civitai.creator
          ? ` · by ${civitai.creator}`
          : ''}{civitai.downloads === null
          ? ''
          : ` · ${count.format(civitai.downloads)} downloads`}{civitai.thumbsUp === null
          ? ''
          : ` · ${count.format(civitai.thumbsUp)} 👍`} · fetched {new Date(
          civitai.fetchedAt
        ).toLocaleDateString()}
      </p>
      <div class="actions">
        <button type="button" onclick={() => void models.openOnCivitai(key)}>
          Open on Civitai
        </button>
        <button
          type="button"
          disabled={models.civitaiBusy}
          onclick={() => void models.refreshFromCivitai(key)}>Refresh</button
        >
        <button type="button" onclick={() => (searching = true)}>Change…</button>
        <button type="button" onclick={() => void models.unlinkFromCivitai(key)}>Unlink</button>
      </div>
      {#if civitai.triggerWords.length > 0}
        <p class="label">Trigger words on Civitai</p>
        <ul class="words" aria-label="Trigger words on Civitai">
          {#each civitai.triggerWords as word (word)}
            <li>{word}</li>
          {/each}
        </ul>
      {/if}
      {#if civitai.versionDescription}
        <p class="label">About this version</p>
        <p class="text">{civitai.versionDescription}</p>
      {/if}
      {#if civitai.description}
        <details>
          <summary>About the model</summary>
          <p class="text">{civitai.description}</p>
        </details>
      {/if}
    {:else}
      <p class="hint">
        Not linked. Looking it up uses the model's file hash, which is an exact match. It contacts
        civitai.com.
      </p>
      <div class="actions">
        <button type="button" disabled={models.civitaiBusy} onclick={() => void lookup()}>
          {models.civitaiBusy ? 'Looking up…' : 'Look up on Civitai'}
        </button>
        <button type="button" onclick={() => (searching = true)}>Search Civitai…</button>
      </div>
    {/if}
  </section>

  <section class="block" aria-label="Your info">
    <h3>Your info</h3>
    {#if editing}
      <ModelForm
        adding={false}
        initial={{ ...model.custom, triggerWords: [...model.custom.triggerWords] }}
        baseModels={models.baseModels}
        onsubmit={(draft) => void save(draft)}
        oncancel={() => (editing = false)}
      />
    {:else}
      <div class="actions">
        <button type="button" onclick={() => (editing = true)}>
          {hasOwnInfo ? 'Edit' : 'Add info'}
        </button>
        {#if hasOwnInfo}
          <button type="button" onclick={() => (confirmingClear = true)}>Clear info</button>
        {/if}
      </div>
      {#if !hasOwnInfo}
        <p class="hint">
          Nothing of your own yet. Your base model and strength override Civitai's, and your trigger
          words are listed first.
        </p>
      {:else}
        <dl>
          <dt>Base model</dt>
          <dd>{model.custom.baseModel ?? '—'}</dd>
          <dt>Strength</dt>
          <dd>{model.custom.strength ?? '—'}</dd>
          <dt>Trigger words</dt>
          <dd>{model.custom.triggerWords.join(', ') || '—'}</dd>
          {#if model.custom.description}
            <dt>Description</dt>
            <dd class="text">{model.custom.description}</dd>
          {/if}
          {#if model.custom.notes}
            <dt>Notes</dt>
            <dd class="text">{model.custom.notes}</dd>
          {/if}
        </dl>
      {/if}
    {/if}
  </section>
</article>

<CivitaiSearchDialog
  open={searching}
  kind={model.kind}
  identity={model.identity}
  initialText={model.name}
  onlink={link}
  onclose={() => (searching = false)}
/>

<ConfirmDialog
  open={confirmingClear}
  title={`Clear what you recorded about ${model.name}?`}
  message="Your base model, trigger words, strength, description and notes are forgotten. What Civitai said, images and files are not touched."
  confirmLabel="Clear"
  onconfirm={() => void clear()}
  oncancel={() => (confirmingClear = false)}
/>

<style>
  article {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
    overflow-wrap: anywhere;
  }
  h3 {
    margin: 0 0 var(--space-2);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }
  .meta,
  .hint {
    margin: 0;
    color: var(--color-text-muted);
  }
  .linked {
    margin: 0 0 var(--space-1);
    overflow-wrap: anywhere;
  }
  .label {
    margin: var(--space-3) 0 var(--space-1);
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }
  .block {
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: var(--space-2) 0;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-2) var(--space-4);
    margin: 0;
  }
  dt {
    color: var(--color-text-muted);
  }
  dd {
    margin: 0;
    min-width: 0;
  }
  .text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin: 0;
  }
  details {
    margin-top: var(--space-2);
  }
  summary {
    cursor: pointer;
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
  }
  .words {
    list-style: none;
    margin: 0 0 var(--space-2);
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .words li {
    background: var(--color-selected);
    border-radius: 999px;
    padding: 0 var(--space-2);
    overflow-wrap: anywhere;
  }
  .badge {
    margin-left: var(--space-1);
    padding: 0 var(--space-2);
    background: var(--color-selected);
    border-radius: 999px;
    font-size: 0.7rem;
  }
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    color: inherit;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
