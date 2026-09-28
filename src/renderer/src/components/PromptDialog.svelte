<script lang="ts">
  interface Props {
    open: boolean
    title: string
    label: string
    initial: string
    confirmLabel: string
    maxlength?: number
    onconfirm: (value: string) => void
    oncancel: () => void
  }

  let { open, title, label, initial, confirmLabel, maxlength, onconfirm, oncancel }: Props =
    $props()
  let dialog: HTMLDialogElement | undefined = $state()
  let value = $state('')

  $effect(() => {
    if (!dialog) return
    if (open && !dialog.open) {
      value = initial
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  })

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    if (value.trim()) onconfirm(value.trim())
  }
</script>

<dialog bind:this={dialog} aria-labelledby="prompt-title" {oncancel}>
  <form onsubmit={submit}>
    <h2 id="prompt-title">{title}</h2>
    <label>
      {label}
      <!-- svelte-ignore a11y_autofocus -->
      <input type="text" bind:value {maxlength} autofocus />
    </label>
    <div class="actions">
      <button type="button" onclick={oncancel}>Cancel</button>
      <button type="submit" class="primary" disabled={!value.trim()}>{confirmLabel}</button>
    </div>
  </form>
</dialog>

<style>
  dialog {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    width: 360px;
    padding: var(--space-5);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 50%);
  }
  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1.1rem;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  input {
    padding: var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: inherit;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-accent-contrast);
  }
</style>
