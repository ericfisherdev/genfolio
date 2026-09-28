<script lang="ts">
  import type { ImageCard } from '@shared/gallery'
  import { ImageDisplay, imageUrl } from '@shared/display-rendition'
  import { CopyVariant } from '@shared/generation-kinds'
  import ActionMenu, { type MenuAction } from './ActionMenu.svelte'
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
    selected: boolean
    /** Whether any image is selected; a plain click then selects instead of opening. */
    selecting: boolean
    /** `range`: from the last selected image to this one (Shift); otherwise toggle. */
    onselect: (range: boolean) => void
    /** Opens the image's look-alike group (the `≈ N` badge). */
    onsimilar: () => void
    /** Menu items that depend on the view, such as arranging an album. */
    moreActions?: readonly MenuAction[]
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
    onrate,
    selected,
    selecting,
    onselect,
    onsimilar,
    moreActions = []
  }: Props = $props()

  function onclick(event: MouseEvent): void {
    if (event.shiftKey) onselect(true)
    else if (event.ctrlKey || event.metaKey || selecting) onselect(false)
    else onopen()
  }
  const name = $derived(card?.fileName ?? `Image ${imageId}`)
</script>

<article class="card" class:selected aria-label={name}>
  <button type="button" class="open" aria-label={`Open ${name}`} {onclick}>
    <img src={imageUrl(imageId, ImageDisplay.Grid)} alt="" decoding="async" draggable="false" />
  </button>
  <label class="select" class:visible={selecting}>
    <input
      type="checkbox"
      checked={selected}
      aria-label={`Select ${name}`}
      onclick={(event) => {
        event.preventDefault()
        onselect(event.shiftKey)
      }}
    />
  </label>
  <div class="actions">
    <ActionMenu
      label={`Actions for ${name}`}
      actions={[
        { label: 'Open', onselect: onopen },
        { label: 'Show in folder', onselect: onreveal },
        { label: 'Copy path', onselect: oncopypath },
        { label: 'Same prompt', onselect: onsameprompt },
        ...moreActions
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
    <div class="footer" class:marked={card.favorite || card.rating > 0 || card.similarCount > 0}>
      <button
        type="button"
        class="favorite"
        class:on={card.favorite}
        aria-pressed={card.favorite}
        aria-label={`Favourite ${name}`}
        onclick={() => onfavorite(!card.favorite)}>{card.favorite ? '♥' : '♡'}</button
      >
      <RatingStars rating={card.rating} {onrate} label={`Rating of ${name}`} />
      {#if card.similarCount > 0}
        <button
          type="button"
          class="similar"
          aria-label={`${card.similarCount} look-alike${card.similarCount === 1 ? '' : 's'} of ${name}`}
          title="Look-alikes"
          onclick={onsimilar}>≈ {card.similarCount}</button
        >
      {/if}
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
  .card.selected {
    outline: 3px solid var(--color-accent);
    outline-offset: -3px;
  }
  .select {
    position: absolute;
    top: var(--space-2);
    left: var(--space-2);
    opacity: 0;
    transition: opacity 120ms;
  }
  .select input {
    width: 18px;
    height: 18px;
    margin: 0;
    cursor: pointer;
    accent-color: var(--color-accent);
  }
  .select.visible,
  .card:hover .select,
  .card:focus-within .select {
    opacity: 1;
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
  .similar {
    padding: 0 var(--space-1);
    border: none;
    border-radius: var(--radius-1);
    background: rgb(0 0 0 / 55%);
    color: #fff;
    font-size: 0.85rem;
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
