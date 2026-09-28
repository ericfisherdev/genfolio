<script lang="ts">
  import type { ImageCard } from '@shared/gallery'
  import { ImageDisplay, imageUrl } from '@shared/display-rendition'
  import { CopyVariant } from '@shared/generation-kinds'
  import ActionMenu from './ActionMenu.svelte'
  import RatingStars from './RatingStars.svelte'

  interface Props {
    imageId: number
    card: ImageCard | undefined
    onopen: () => void
    onreveal: () => void
    oncopypath: () => void
    /** Click copies the prompt; Shift-click copies all generation data. */
    oncopy: (variant: CopyVariant) => void
    /** Shows every image with this image's prompt. */
    onsameprompt: () => void
    onfavorite: (favorite: boolean) => void
    onrate: (rating: number) => void
  }

  let {
    imageId,
    card,
    onopen,
    onreveal,
    oncopypath,
    oncopy,
    onsameprompt,
    onfavorite,
    onrate
  }: Props = $props()
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
        { label: 'Copy path', onselect: oncopypath },
        { label: 'Same prompt', onselect: onsameprompt }
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
  {#if card}
    <!-- Always shown once the image is a favourite or rated; otherwise on hover or focus. -->
    <div class="footer" class:marked={card.favorite || card.rating > 0}>
      <button
        type="button"
        class="favorite"
        class:on={card.favorite}
        aria-pressed={card.favorite}
        aria-label={`Favourite ${name}`}
        onclick={() => onfavorite(!card.favorite)}>{card.favorite ? '♥' : '♡'}</button
      >
      <RatingStars rating={card.rating} {onrate} label={`Rating of ${name}`} />
    </div>
  {/if}
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
  .footer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-2) var(--space-1);
    border-radius: 0 0 var(--radius-2) var(--radius-2);
    background: linear-gradient(transparent, rgb(0 0 0 / 65%));
    opacity: 0;
    transition: opacity 120ms;
  }
  .footer.marked,
  .card:hover .footer,
  .card:focus-within .footer {
    opacity: 1;
  }
  .favorite {
    padding: 0;
    background: none;
    border: none;
    color: #fff;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }
  .favorite.on {
    color: #ff6b8b;
  }
  .card:hover .actions,
  .card:focus-within .actions {
    opacity: 1;
  }
</style>
