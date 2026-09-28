<script lang="ts">
  interface Props {
    open: boolean
    title: string
    message: string
    confirmLabel: string
    onconfirm: () => void
    oncancel: () => void
  }

  let { open, title, message, confirmLabel, onconfirm, oncancel }: Props = $props()
  let dialog: HTMLDialogElement | undefined = $state()

  $effect(() => {
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  })
</script>

<dialog bind:this={dialog} aria-labelledby="confirm-title" {oncancel}>
  <h2 id="confirm-title">{title}</h2>
  <p>{message}</p>
  <div class="actions">
    <button type="button" onclick={oncancel}>Cancel</button>
    <button type="button" class="danger" onclick={onconfirm}>{confirmLabel}</button>
  </div>
</dialog>

<style>
  dialog {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    max-width: 420px;
    padding: var(--space-5);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 50%);
  }
  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1.1rem;
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
  .danger {
    background: var(--color-danger);
    border-color: var(--color-danger);
    color: #fff;
  }
</style>
