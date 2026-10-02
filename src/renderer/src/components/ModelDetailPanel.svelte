<script lang="ts">
  import { ModelKind } from '@shared/generation-kinds'
  import type { ModelDetail } from '@shared/models'
  import { getAppServices } from '../lib/app-context'
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

  // A different model starts in view mode, not in the previous model's form.
  $effect(() => {
    void model.kind
    void model.identity
    editing = false
  })

  const key = $derived({ kind: model.kind, identity: model.identity })
  const kindLabel = $derived(model.kind === ModelKind.Lora ? 'LoRA' : 'Checkpoint')

  async function save(draft: ModelDraft): Promise<void> {
    if (await models.save(key, draft.fields)) editing = false
  }

  async function clear(): Promise<void> {
    confirmingClear = false
    await models.clear(key)
  }
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

  {#if editing}
    <ModelForm
      adding={false}
      initial={{ ...model, triggerWords: [...model.triggerWords] }}
      baseModels={models.baseModels}
      onsubmit={(draft) => void save(draft)}
      oncancel={() => (editing = false)}
    />
  {:else}
    <div class="actions">
      <button type="button" onclick={() => (editing = true)}>
        {model.hasInfo ? 'Edit' : 'Add info'}
      </button>
      {#if model.hasInfo}
        <button type="button" onclick={() => (confirmingClear = true)}>Clear info</button>
      {/if}
    </div>

    {#if !model.hasInfo}
      <p class="hint">Nothing recorded yet: add the base model, trigger words and strength.</p>
    {/if}

    <dl>
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
      {#if model.description}
        <dt>Description</dt>
        <dd class="text">{model.description}</dd>
      {/if}
      {#if model.notes}
        <dt>Notes</dt>
        <dd class="text">{model.notes}</dd>
      {/if}
    </dl>
  {/if}
</article>

<ConfirmDialog
  open={confirmingClear}
  title={`Clear what is recorded about ${model.name}?`}
  message="Its base model, trigger words, strength, description and notes are forgotten. Images and files are not touched."
  confirmLabel="Clear"
  onconfirm={() => void clear()}
  oncancel={() => (confirmingClear = false)}
/>

<style>
  article {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
    overflow-wrap: anywhere;
  }
  .meta,
  .hint {
    margin: 0;
    color: var(--color-text-muted);
  }
  .actions {
    display: flex;
    gap: var(--space-2);
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
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    color: inherit;
  }
</style>
