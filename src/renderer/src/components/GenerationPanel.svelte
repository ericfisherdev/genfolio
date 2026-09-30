<script lang="ts">
  import type { GenerationDetails } from '@shared/generation'
  import { CopyVariant } from '@shared/generation-kinds'
  import { generatorLabel, originDescription, originLabel } from '../lib/format/generation-labels'
  import { canFindSeed, FindKind, type FindSimilar } from '../lib/gallery/find-similar'
  import ClampedText from './ClampedText.svelte'
  import ResourceList from './ResourceList.svelte'

  interface Props {
    /** undefined while loading, null when the image carries no generation data. */
    details: GenerationDetails | null | undefined
    loadError: string | undefined
    /** True while the shown data belongs to the previous image and the next is loading. */
    busy: boolean
    oncopy: (variant: CopyVariant) => void
    onretry: () => void
    /** Opens the gallery filtered to what this image shares with others. */
    onfind: (find: FindSimilar) => void
  }

  let { details, loadError, busy, oncopy, onretry, onfind }: Props = $props()

  /** Text selected in the prompt, offered as a search. */
  let selection = $state('')
  const MAX_SELECTION = 200
  let promptElement: HTMLElement | undefined = $state()

  // A new image's prompt starts with nothing selected.
  $effect.pre(() => {
    void details
    selection = ''
  })

  /** Only a selection that starts and ends inside the prompt text counts. */
  function readSelection(): void {
    const current = document.getSelection()
    const inside =
      current !== null &&
      current.rangeCount > 0 &&
      promptElement !== undefined &&
      promptElement.contains(current.anchorNode) &&
      promptElement.contains(current.focusNode)
    const text = inside ? current.toString().trim() : ''
    selection = text.length <= MAX_SELECTION ? text : ''
  }
  let collapsed = $state(false)

  /** The chips under "Other metadata": only values the source recorded. */
  const chips = $derived.by((): [string, string][] => {
    if (!details) return []
    const size =
      details.width !== null && details.height !== null
        ? `${details.width}×${details.height}`
        : null
    const entries: [string, string | number | null][] = [
      ['Steps', details.steps],
      ['CFG', details.cfgScale],
      ['Sampler', details.sampler],
      ['Scheduler', details.scheduler],
      ['Seed', details.seed],
      ['Size', size],
      ['VAE', details.vae],
      ['Performance', details.performance],
      ['Styles', details.styles?.join(', ') ?? null]
    ]
    return entries.flatMap(([label, value]) =>
      value === null || value === '' ? [] : [[label, String(value)] as [string, string]]
    )
  })
</script>

<svelte:document onselectionchange={readSelection} />

<section class="generation" aria-labelledby="generation-heading" aria-busy={busy}>
  <header>
    <h2 id="generation-heading">Generation data</h2>
    {#if details}
      <button type="button" class="copy-all" onclick={() => oncopy(CopyVariant.All)}>
        Copy all
      </button>
      <button
        type="button"
        class="copy-all"
        title="Copy the parameters as JSON; paste into Fooocus's prompt box and click Load Parameters"
        onclick={() => oncopy(CopyVariant.Fooocus)}
      >
        Copy for Fooocus
      </button>
    {/if}
    <button
      type="button"
      class="collapse"
      aria-label="Generation data details"
      aria-controls="generation-body"
      aria-expanded={!collapsed}
      onclick={() => (collapsed = !collapsed)}>{collapsed ? '▸' : '▾'}</button
    >
  </header>

  <div id="generation-body" hidden={collapsed}>
    {#if loadError}
      <p class="muted" role="alert">Could not load generation data: {loadError}</p>
      <button type="button" class="link" onclick={onretry}>Retry</button>
    {:else if details === undefined}
      <p class="muted">Loading generation data…</p>
    {:else if details === null}
      <p class="muted">This image has no generation data.</p>
    {:else}
      {#if details.resources.length > 0}
        <h3>Resources used</h3>
        <ResourceList
          resources={details.resources}
          disabled={busy}
          onpick={(resource) => onfind({ kind: FindKind.Resource, resource })}
        />
      {/if}

      {#if details.prompt}
        <div class="block-heading">
          <h3>Prompt</h3>
          <span class="badge">{generatorLabel(details.generator)}</span>
          <span class="badge" title={originDescription(details.origin)}>
            {originLabel(details.origin)}
          </span>
          <span class="actions">
            <button
              type="button"
              disabled={busy}
              onclick={() => onfind({ kind: FindKind.SamePrompt })}
            >
              Same prompt
            </button>
            <button type="button" onclick={() => oncopy(CopyVariant.Prompt)}>Copy prompt</button>
            <button
              type="button"
              title="Copy the prompt with <lora:name:weight> tags appended"
              onclick={() => oncopy(CopyVariant.PromptWithLoras)}>+ LoRA tags</button
            >
          </span>
        </div>
        <div class="prompt" bind:this={promptElement}>
          <ClampedText text={details.prompt} />
        </div>
        {#if selection}
          <button
            type="button"
            class="search-selection"
            disabled={busy}
            onclick={() => onfind({ kind: FindKind.Keywords, text: selection })}
            >Search for “{selection.length > 40 ? `${selection.slice(0, 40)}…` : selection}”</button
          >
        {/if}
      {/if}

      {#if details.negativePrompt}
        <div class="block-heading">
          <h3>Negative prompt</h3>
          <span class="actions">
            <button type="button" onclick={() => oncopy(CopyVariant.Negative)}>
              Copy negative prompt
            </button>
          </span>
        </div>
        <ClampedText text={details.negativePrompt} />
      {/if}

      {#if chips.length > 0}
        <h3>Other metadata</h3>
        <ul class="chips" aria-label="Other metadata">
          {#if canFindSeed(details.seed)}
            <li class="find">
              <button
                type="button"
                disabled={busy}
                onclick={() => onfind({ kind: FindKind.SameSeed })}>Same seed</button
              >
            </li>
          {/if}
          {#each chips as [label, value] (label)}
            <li><span class="chip-label">{label}</span> {value}</li>
          {/each}
        </ul>
      {/if}

      {#if details.sources.length > 0}
        <details class="sources">
          <summary>Sources</summary>
          {#each details.sources as source (source.origin)}
            <h4>{originDescription(source.origin)}</h4>
            <dl>
              {#each source.records as record, index (index)}
                <dt>{record.key}</dt>
                <dd>{record.value}</dd>
              {/each}
            </dl>
          {/each}
        </details>
      {/if}
    {/if}
  </div>
</section>

<style>
  .generation {
    padding: var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 1rem;
  }
  h3 {
    margin: var(--space-4) 0 var(--space-2);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }
  h4 {
    margin: var(--space-3) 0 var(--space-1);
    font-size: 0.85rem;
  }
  .block-heading {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: var(--space-4) 0 var(--space-2);
  }
  .block-heading h3 {
    margin: 0;
  }
  .actions {
    margin-left: auto;
    display: flex;
    gap: var(--space-1);
  }
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
    font-size: 0.85em;
  }
  .collapse {
    border: none;
    background: none;
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-accent);
  }
  .badge {
    padding: 0 var(--space-2);
    border-radius: var(--radius-1);
    background: var(--color-selected);
    font-size: 0.75em;
    text-transform: uppercase;
  }
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .chips li {
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-1);
    background: var(--color-surface-raised);
    word-break: break-word;
  }
  .chip-label {
    color: var(--color-text-muted);
  }
  .find button,
  .search-selection {
    margin-top: var(--space-1);
  }
  .sources {
    margin-top: var(--space-4);
  }
  .sources summary {
    cursor: pointer;
    color: var(--color-text-muted);
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-1) var(--space-2);
  }
  dt {
    color: var(--color-text-muted);
  }
  dd {
    margin: 0;
    max-height: 12em;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
  }
  .muted {
    color: var(--color-text-muted);
  }
</style>
