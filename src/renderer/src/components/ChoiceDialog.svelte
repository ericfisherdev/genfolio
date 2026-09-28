<script lang="ts">
  interface Props {
    open: boolean
    title: string
    message: string
    label: string
    options: readonly { value: number; label: string }[]
    confirmLabel: string
    onconfirm: (value: number) => void
    oncancel: () => void
  }

  let { open, title, message, label, options, confirmLabel, onconfirm, oncancel }: Props = $props()
  // Unique per instance: several dialogs of one kind can be on the page at once.
  const uid = $props.id()
  const titleId = `${uid}-title`
  let dialog: HTMLDialogElement | undefined = $state()
  let chosen = $state(0)

  $effect(() => {
    if (!dialog) return
    if (open && !dialog.open) {
      chosen = options[0]?.value ?? 0
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  })
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} {oncancel}>
  <h2 id={titleId}>{title}</h2>
  <p>{message}</p>
  <label>
    {label}
    <select bind:value={chosen}>
      {#each options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </label>
  <div class="actions">
    <button type="button" onclick={oncancel}>Cancel</button>
    <button type="button" class="primary" disabled={!chosen} onclick={() => onconfirm(chosen)}
      >{confirmLabel}</button
    >
  </div>
</dialog>

<style>
  dialog {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    width: 380px;
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
  select {
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
