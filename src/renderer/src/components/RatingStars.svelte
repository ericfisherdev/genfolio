<script lang="ts">
  import { MAX_RATING } from '@shared/gallery-kinds'

  interface Props {
    rating: number
    /** Called with the new rating; choosing the current one clears it to 0. */
    onrate: (rating: number) => void
    /** What is being rated, for screen readers. */
    label?: string
  }

  let { rating, onrate, label = 'Rating' }: Props = $props()
  let hovered = $state(0)
  const shown = $derived(hovered || rating)
  const stars = Array.from({ length: MAX_RATING }, (_, index) => index + 1)
</script>

<div class="stars" role="group" aria-label={label} onpointerleave={() => (hovered = 0)}>
  {#each stars as value (value)}
    <button
      type="button"
      class:lit={value <= shown}
      aria-label={`${value} star${value === 1 ? '' : 's'}`}
      aria-pressed={value === rating}
      title={value === rating ? 'Clear rating' : `Rate ${value}`}
      onpointerenter={() => (hovered = value)}
      onclick={() => onrate(value === rating ? 0 : value)}>★</button
    >
  {/each}
</div>

<style>
  .stars {
    display: inline-flex;
  }
  button {
    padding: 0 1px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    color: rgb(255 255 255 / 35%);
  }
  button.lit {
    color: #fcc419;
  }
  button:focus-visible {
    outline: 2px solid var(--color-accent);
    border-radius: var(--radius-1);
  }
</style>
