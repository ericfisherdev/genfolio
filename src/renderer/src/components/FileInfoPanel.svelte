<script lang="ts">
  import type { ImageCard } from '@shared/gallery'
  import { folderName } from '../lib/format/folder-name'
  import { formatBytes, formatDate } from '../lib/format/file-facts'
  import RatingStars from './RatingStars.svelte'

  interface Props {
    card: ImageCard | undefined
    rootPath: string | undefined
    onreveal: () => void
    oncopypath: () => void
    onfavorite: (favorite: boolean) => void
    onrate: (rating: number) => void
  }

  let { card, rootPath, onreveal, oncopypath, onfavorite, onrate }: Props = $props()
  const folder = $derived.by(() => {
    if (!card) return ''
    const root = rootPath ? folderName(rootPath) : ''
    return card.relDir ? `${root}/${card.relDir}` : root
  })
</script>

<aside class="panel" aria-label="File details">
  {#if card}
    <h2 title={card.fileName}>{card.fileName}</h2>
    <div class="marks">
      <button
        type="button"
        class="favorite"
        class:on={card.favorite}
        aria-pressed={card.favorite}
        title="Favourite (F)"
        onclick={() => onfavorite(!card.favorite)}
        >{card.favorite ? '♥ Favourite' : '♡ Favourite'}</button
      >
      <RatingStars rating={card.rating} {onrate} label="Rating (0–5)" />
    </div>
    <dl>
      <dt>Folder</dt>
      <dd>{folder}</dd>
      <dt>Dimensions</dt>
      <dd>{card.width} × {card.height}</dd>
      <dt>Format</dt>
      <dd>{card.format.toUpperCase()}</dd>
      <dt>Size</dt>
      <dd>{formatBytes(card.sizeBytes)}</dd>
      <dt>Created</dt>
      <dd>{formatDate(card.createdAt)}</dd>
      <dt>Added</dt>
      <dd>{formatDate(card.addedAt)}</dd>
    </dl>
    <div class="actions">
      <button type="button" onclick={onreveal}>Show in folder</button>
      <button type="button" onclick={oncopypath}>Copy path</button>
    </div>
  {:else}
    <p class="muted">Loading details…</p>
  {/if}
</aside>

<style>
  .panel {
    padding: var(--space-4);
  }
  h2 {
    margin: 0 0 var(--space-3);
    font-size: 1rem;
    word-break: break-all;
  }
  .marks {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }
  .favorite.on {
    color: #ff6b8b;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-2) var(--space-3);
    margin: 0;
  }
  dt {
    color: var(--color-text-muted);
  }
  dd {
    margin: 0;
    word-break: break-word;
  }
  .actions {
    display: flex;
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
  .muted {
    color: var(--color-text-muted);
  }
</style>
