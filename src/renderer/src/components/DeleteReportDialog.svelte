<script lang="ts">
  import { DeleteFailure } from '@shared/deletion-kinds'
  import { getAppServices } from '../lib/app-context'

  const REASONS: Record<DeleteFailure, string> = {
    [DeleteFailure.Refused]: 'not deleted: the file could not be verified as this image’s file',
    [DeleteFailure.Unreadable]: 'not deleted: the file could not be opened',
    [DeleteFailure.TrashFailed]: 'could not be moved to the trash; kept',
    [DeleteFailure.RemoveFailed]: 'could not be deleted'
  }

  const { deletion } = getAppServices()
  const uid = $props.id()
  const titleId = `${uid}-title`
  let dialog: HTMLDialogElement | undefined = $state()
  const failed = $derived(deletion.report?.failed ?? [])

  $effect(() => {
    if (!dialog) return
    if (failed.length > 0 && !dialog.open) dialog.showModal()
    if (failed.length === 0 && dialog.open) dialog.close()
  })
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} oncancel={() => deletion.dismissReport()}>
  <h2 id={titleId}>Some images were not deleted</h2>
  <ul aria-label="Images not deleted">
    {#each failed as failure (failure.imageId)}
      <li>
        <span class="name">{failure.fileName}</span>
        — {REASONS[failure.reason]}{failure.code ? ` (${failure.code})` : ''}
      </li>
    {/each}
  </ul>
  <div class="actions">
    <button type="button" class="primary" onclick={() => deletion.dismissReport()}>OK</button>
  </div>
</dialog>

<style>
  dialog {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    max-width: 520px;
    padding: var(--space-5);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 50%);
  }
  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1.1rem;
  }
  ul {
    max-height: 50vh;
    overflow-y: auto;
    margin: 0;
    padding-left: var(--space-4);
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-4);
  }
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
</style>
