<script lang="ts">
  import { getAppServices } from '../lib/app-context'
  import { folderName } from '../lib/format/folder-name'
  import { scanProgressText } from '../lib/format/scan-progress-text'

  const { scans, library } = getAppServices()
  const count = new Intl.NumberFormat()

  const nameOf = (rootId: number): string => {
    const root = library.roots.find((candidate) => candidate.id === rootId)
    return root ? folderName(root.path) : 'library'
  }
</script>

<div class="scan" role="status" aria-live="polite" aria-label="Scan progress">
  {#each Object.entries(scans.active) as [rootId, progress] (rootId)}
    <span class="running">{nameOf(Number(rootId))}: {scanProgressText(progress)}</span>
  {/each}
  {#if scans.hashing}
    <span class="running">
      Finding look-alikes {count.format(scans.hashing.done)} / {count.format(scans.hashing.total)}
    </span>
  {/if}
  {#each scans.unwatched as rootId (rootId)}
    <span class="failed">
      {nameOf(rootId)} can't be watched for changes (system limit); it is rescanned every 10 minutes.
    </span>
  {/each}
  {#each Object.entries(scans.failures) as [rootId, reason] (rootId)}
    <span class="failed">Scan of {nameOf(Number(rootId))} failed: {reason}</span>
  {/each}
</div>

<style>
  .scan {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.85rem;
    color: var(--color-text-muted);
  }
  .failed {
    color: var(--color-danger);
  }
</style>
