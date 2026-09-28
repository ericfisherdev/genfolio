<script lang="ts">
  import type { ImageCard } from '@shared/gallery'
  import { ImageDisplay, imageUrl } from '@shared/display-rendition'
  import { CopyVariant } from '@shared/generation-kinds'
  import ActionMenu from './ActionMenu.svelte'

  interface Props {
    imageId: number
    card: ImageCard | undefined
    onopen: () => void
    onreveal: () => void
    oncopypath: () => void
    /** Click copies the prompt; Shift-click copies all generation data. */
    oncopy: (variant: CopyVariant) => void
  }

  let { imageId, card, onopen, onreveal, oncopypath, oncopy }: Props = $props()
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
    <button
      type="button"
      class="copy"
      aria-label={`Copy prompt of ${name}`}
      title="Copy prompt (Shift-click: all generation data)"
      onclick={(event) => oncopy(event.shiftKey ? CopyVariant.All : CopyVariant.Prompt)}>⧉</button
    >
  </div>
</article>

<style>
  .card {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: var(--radius-2);
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
    border-radius: inherit;
    overflow: hidden;
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
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    color: #fff;
    text-shadow: 0 0 4px rgb(0 0 0 / 80%);
    opacity: 0;
    transition: opacity 120ms;
  }
  .copy {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 50%;
    border: none;
    background: rgb(0 0 0 / 55%);
    color: #fff;
    cursor: pointer;
    line-height: 1;
  }
  .copy:hover,
  .copy:focus-visible {
    background: rgb(0 0 0 / 80%);
  }
  .card:hover .actions,
  .card:focus-within .actions {
    opacity: 1;
  }
</style>
