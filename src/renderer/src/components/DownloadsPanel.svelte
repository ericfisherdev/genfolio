<script lang="ts">
  import { DownloadStatus, isFinished, type DownloadSnapshot } from '@shared/downloads'
  import { formatBytes } from '@shared/format-bytes'
  import { getAppServices } from '../lib/app-context'

  const { downloads } = getAppServices()

  $effect(() => {
    void downloads.load()
  })

  const hasFinished = $derived(downloads.items.some((item) => isFinished(item.status)))

  const percent = (item: DownloadSnapshot): number | undefined =>
    item.totalBytes
      ? Math.min(100, Math.round((item.receivedBytes / item.totalBytes) * 100))
      : undefined

  function describe(item: DownloadSnapshot): string {
    switch (item.status) {
      case DownloadStatus.Queued:
        return 'Waiting…'
      case DownloadStatus.Downloading: {
        const total = item.totalBytes ? ` of ${formatBytes(item.totalBytes)}` : ''
        return `${formatBytes(item.receivedBytes)}${total}`
      }
      case DownloadStatus.Completed:
        return `Saved to ${item.path ?? ''}${item.message ? ` · ${item.message}` : ''}`
      case DownloadStatus.AlreadyExists:
        return `Already at ${item.path ?? ''}`
      case DownloadStatus.Cancelled:
        return 'Cancelled'
      case DownloadStatus.Failed:
        return item.message ?? 'Failed'
    }
  }
</script>

{#if downloads.items.length > 0}
  <section class="downloads" aria-label="Downloads">
    <header>
      <h2>Downloads</h2>
      {#if hasFinished}
        <button type="button" onclick={() => void downloads.clearFinished()}>Clear finished</button>
      {/if}
    </header>
    <ul>
      {#each downloads.items as item (item.id)}
        <li>
          <div class="info">
            <span class="name">{item.fileName ?? item.modelName ?? 'Model'}</span>
            <span class="status" class:failed={item.status === DownloadStatus.Failed}>
              {describe(item)}
            </span>
            {#if item.status === DownloadStatus.Downloading}
              <progress
                max="100"
                value={percent(item)}
                aria-label={`Progress of ${item.fileName ?? 'the download'}`}
              ></progress>
            {/if}
          </div>
          {#if !isFinished(item.status)}
            <button
              type="button"
              aria-label={`Cancel ${item.fileName ?? 'the download'}`}
              onclick={() => void downloads.cancel(item.id)}>Cancel</button
            >
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .downloads {
    border-top: 1px solid var(--color-border);
    padding: var(--space-3) var(--space-5);
    max-height: 32vh;
    overflow-y: auto;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  h2 {
    margin: 0;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .status {
    color: var(--color-text-muted);
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  .failed {
    color: var(--color-danger);
  }
  progress {
    width: 100%;
    height: 6px;
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
