<script lang="ts">
  import { baseModelFolder } from '@shared/base-model-folder'
  import type { CivitaiBrowseItem } from '@shared/civitai-browse'
  import { DownloadStatus } from '@shared/downloads'
  import { formatBytes } from '@shared/format-bytes'
  import { ModelKind } from '@shared/generation-kinds'
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'

  interface Props {
    item: CivitaiBrowseItem
    kind: ModelKind
  }

  let { item, kind }: Props = $props()
  const { downloads, modelFolders, router } = getAppServices()
  const count = new Intl.NumberFormat()

  const downloadable = $derived(item.versions.filter((candidate) => candidate.fileName !== null))
  let chosenId: number | undefined = $state()
  const version = $derived(
    downloadable.find((candidate) => candidate.versionId === chosenId) ?? downloadable[0]
  )
  const request = $derived(
    version ? { kind, modelId: item.modelId, versionId: version.versionId } : undefined
  )
  const latest = $derived(request ? downloads.latest(request) : undefined)
  const busy = $derived(request ? downloads.isActive(request) : false)
  const folder = $derived(modelFolders.folders[kind])
  const kindLabel = $derived(kind === ModelKind.Lora ? 'LoRAs' : 'checkpoints')
  const subfolder = $derived(baseModelFolder(version?.baseModel))

  const versionLabel = (candidate: (typeof downloadable)[number]): string =>
    [
      candidate.name,
      candidate.baseModel,
      candidate.sizeKb === null ? null : formatBytes(candidate.sizeKb * 1024)
    ]
      .filter(Boolean)
      .join(' · ')
</script>

<article aria-label={item.name}>
  <header>
    <h3>{item.name}</h3>
    {#if item.nsfw}<span class="badge">NSFW</span>{/if}
  </header>
  <p class="meta">
    {item.creator ? `by ${item.creator}` : 'unknown creator'}{item.downloads === null
      ? ''
      : ` · ${count.format(item.downloads)} downloads`}{item.thumbsUp === null
      ? ''
      : ` · ${count.format(item.thumbsUp)} 👍`}
  </p>
  {#if item.tags.length > 0}
    <p class="tags">{item.tags.slice(0, 6).join(' · ')}</p>
  {/if}

  {#if version && request}
    <div class="row">
      <label>
        Version
        <select
          value={String(version.versionId)}
          onchange={(event) => (chosenId = Number(event.currentTarget.value))}
        >
          {#each downloadable as candidate (candidate.versionId)}
            <option value={String(candidate.versionId)}>{versionLabel(candidate)}</option>
          {/each}
        </select>
      </label>
    </div>
    {#if version.trainedWords.length > 0}
      <p class="words">Trigger words: {version.trainedWords.join(', ')}</p>
    {/if}

    {#if folder === null}
      <p class="target">
        Choose the {kindLabel} download folder to save this.
        <button
          type="button"
          class="link"
          onclick={() => router.navigate({ kind: RouteKind.Settings })}>Open Settings</button
        >
      </p>
    {:else}
      <p class="target">Saves to <code>{folder}/{subfolder}/{version.fileName}</code></p>
    {/if}

    <div class="row">
      {#if busy}
        <button type="button" disabled>
          {latest?.status === DownloadStatus.Queued ? 'Waiting…' : 'Downloading…'}
        </button>
      {:else}
        <button
          type="button"
          class="primary"
          disabled={folder === null}
          onclick={() => void downloads.start(request)}
        >
          {latest?.status === DownloadStatus.Failed || latest?.status === DownloadStatus.Cancelled
            ? 'Try again'
            : 'Download'}
        </button>
      {/if}
      {#if latest?.status === DownloadStatus.Completed}
        <span class="done">Downloaded</span>
      {:else if latest?.status === DownloadStatus.AlreadyExists}
        <span class="done">Already in the folder</span>
      {:else if latest?.status === DownloadStatus.Failed}
        <span class="failed">{latest.message}</span>
      {/if}
    </div>
  {/if}
</article>

<style>
  article {
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  h3 {
    margin: 0;
    font-size: 1rem;
    overflow-wrap: anywhere;
  }
  .meta,
  .tags,
  .words,
  .target {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }
  .badge {
    padding: 0 var(--space-2);
    background: var(--color-selected);
    border-radius: 999px;
    font-size: 0.7rem;
  }
  .row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }
  select {
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: var(--color-text);
    max-width: 100%;
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
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-accent);
    text-decoration: underline;
  }
  .done {
    color: var(--color-text-muted);
  }
  .failed {
    color: var(--color-danger);
    font-size: 0.85rem;
  }
</style>
