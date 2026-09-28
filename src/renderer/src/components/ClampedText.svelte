<script lang="ts">
  interface Props {
    text: string
    /** Lines shown before "Show more". */
    lines?: number
  }

  let { text, lines = 8 }: Props = $props()
  let expanded = $state(false)
  // Judged from the text rather than measured, so it holds before layout and in any width:
  // more lines than the clamp, or more characters than about that many lines of prompt.
  const long = $derived(text.split('\n').length > lines || text.length > lines * 60)
</script>

<p class="text" class:clamped={long && !expanded} style:--lines={lines}>{text}</p>
{#if long}
  <button
    type="button"
    class="toggle"
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    {expanded ? 'Show less' : 'Show more'}
  </button>
{/if}

<style>
  .text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.45;
  }
  .clamped {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: var(--lines);
    line-clamp: var(--lines);
    overflow: hidden;
  }
  .toggle {
    margin-top: var(--space-1);
    padding: 0;
    background: none;
    border: none;
    color: var(--color-accent);
    cursor: pointer;
  }
</style>
