<script lang="ts">
  import { untrack } from 'svelte'
  import { ModelKind } from '@shared/generation-kinds'
  import {
    MAX_BASE_MODEL,
    MAX_MODEL_NAME,
    MAX_MODEL_TEXT,
    MAX_STRENGTH,
    type ModelFields
  } from '@shared/models'

  /** What a submitted form holds; `kind` and `name` are the ones typed when adding a model. */
  export interface ModelDraft {
    kind: ModelKind
    name: string
    fields: ModelFields
  }

  interface Props {
    /** Adding a model by hand asks for its kind and name; editing one keeps them. */
    adding: boolean
    initial: ModelFields
    /** Base models already recorded, offered as suggestions. */
    baseModels: readonly string[]
    onsubmit: (draft: ModelDraft) => void
    oncancel: () => void
  }

  let { adding, initial, baseModels, onsubmit, oncancel }: Props = $props()
  // The form edits a copy: later changes to `initial` don't overwrite what is being typed.
  const start = untrack(() => initial)

  let kind = $state(ModelKind.Lora)
  let name = $state('')
  let baseModel = $state(start.baseModel ?? '')
  // One trigger word per line: a word can hold commas ("1girl, solo").
  let triggerWords = $state(start.triggerWords.join('\n'))
  let strength = $state(start.strength === null ? '' : String(start.strength))
  let description = $state(start.description ?? '')
  let notes = $state(start.notes ?? '')

  // Kept as the text typed: bind:value on a number input would give a number, or null when empty.
  const strengthValue = $derived(strength.trim() === '' ? null : Number(strength))
  const strengthValid = $derived(
    strengthValue === null ||
      (Number.isFinite(strengthValue) && Math.abs(strengthValue) <= MAX_STRENGTH)
  )
  const valid = $derived(strengthValid && (!adding || name.trim() !== ''))

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (!valid) return
    onsubmit({
      kind,
      name: name.trim(),
      fields: {
        baseModel: baseModel.trim() || null,
        triggerWords: triggerWords
          .split('\n')
          .map((word) => word.trim())
          .filter(Boolean),
        strength: strengthValue,
        description: description.trim() || null,
        notes: notes.trim() || null
      }
    })
  }
</script>

<form onsubmit={submit} aria-label={adding ? 'Add a model' : 'Edit model'}>
  {#if adding}
    <label>
      Type
      <select bind:value={kind}>
        <option value={ModelKind.Lora}>LoRA</option>
        <option value={ModelKind.Checkpoint}>Checkpoint</option>
      </select>
    </label>
    <label>
      Name
      <input
        type="text"
        bind:value={name}
        maxlength={MAX_MODEL_NAME}
        placeholder="File name, e.g. add-detail-xl"
        required
      />
    </label>
  {/if}
  <label>
    Base model
    <input
      type="text"
      list="base-model-suggestions"
      bind:value={baseModel}
      maxlength={MAX_BASE_MODEL}
      placeholder="e.g. SDXL 1.0, Pony, SD 1.5"
    />
    <datalist id="base-model-suggestions">
      {#each baseModels as suggestion (suggestion)}
        <option value={suggestion}></option>
      {/each}
    </datalist>
  </label>
  <label>
    Trigger words
    <textarea bind:value={triggerWords} rows="3" placeholder="One per line"></textarea>
  </label>
  <label>
    Strength
    <input
      type="number"
      step="0.05"
      min={-MAX_STRENGTH}
      max={MAX_STRENGTH}
      value={strength}
      oninput={(event) => (strength = event.currentTarget.value)}
      aria-invalid={!strengthValid}
      placeholder="e.g. 0.8"
    />
  </label>
  <label>
    Description
    <textarea bind:value={description} rows="3" maxlength={MAX_MODEL_TEXT}></textarea>
  </label>
  <label>
    Notes
    <textarea bind:value={notes} rows="3" maxlength={MAX_MODEL_TEXT}></textarea>
  </label>
  <div class="actions">
    <button type="submit" class="primary" disabled={!valid}>{adding ? 'Add model' : 'Save'}</button>
    <button type="button" onclick={oncancel}>Cancel</button>
  </div>
</form>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 560px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }
  input,
  select,
  textarea {
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: var(--color-text);
    font: inherit;
  }
  input[aria-invalid='true'] {
    border-color: var(--color-danger);
  }
  .actions {
    display: flex;
    gap: var(--space-2);
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
</style>
