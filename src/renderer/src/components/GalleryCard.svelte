<script lang="ts">
  import type { ImageCard } from '@shared/gallery'
  import { ImageDisplay, imageUrl } from '@shared/display-rendition'
  import ActionMenu from './ActionMenu.svelte'

  interface Props {
    imageId: number
    card: ImageCard | undefined
    onopen: () => void
    onreveal: () => void
    oncopypath: () => void
  }

  let { imageId, card, onopen, onreveal, oncopypath }: Props = $props()
  const name = $derived(card?.fileName ?? `Image ${imageId}`)
</script>

<article class="card" aria-label={name}>
  <button type="button" class="open" aria-label={`Open ${name}`} onclick={onopen}>
    <img src={imageUrl(imageId, ImageDisplay.Grid)} alt="" decoding="async" draggable="false" />
  </button>
  <div class="actions">
    <ActionMenu
      label={`Actions for ${name}`}
      actions={[
        { label: 'Open', onselect: onopen },
        { label: 'Show in folder', onselect: onreveal },
        { label: 'Copy path', onselect: oncopypath }
      ]}
    />
  </div>
</article>

<style>
  .card {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: var(--radius-2);
    overflow: hidden;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    box-sizing: border-box;
  }
  .open {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    background: none;
    cursor: zoom-in;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .actions {
    position: absolute;
    top: var(--space-2);
    right: var(--space-1);
    color: #fff;
    text-shadow: 0 0 4px rgb(0 0 0 / 80%);
    opacity: 0;
    transition: opacity 120ms;
  }
  .card:hover .actions,
  .card:focus-within .actions {
    opacity: 1;
  }
</style>
