<script lang="ts">
  import type { GenerationResource } from '@shared/generation'
  import { ResourceKind } from '@shared/generation-kinds'
  import { originDescription, resourceKindLabel, shortHash } from '../lib/format/generation-labels'

  interface Props {
    resources: readonly GenerationResource[]
    /** Rows shown before "Show all". */
    limit?: number
    /** Opens the gallery filtered to a stored model; rows without a model id aren't links. */
    onpick: (resource: GenerationResource) => void
    /** While the panel shows the previous image's data, links wait for the new one. */
    disabled?: boolean
  }

  let { resources, limit = 5, onpick, disabled = false }: Props = $props()
  let showAll = $state(false)
  const shown = $derived(showAll ? resources : resources.slice(0, limit))

  function weightTitle(resource: GenerationResource): string {
    return resource.weightSource === null
      ? 'No source recorded this LoRA’s weight'
      : `Weight from ${originDescription(resource.weightSource)}`
  }
</script>

<ul class="resources">
  {#each shown as resource (`${resource.kind}:${resource.name}`)}
    <li>
      {#if resource.modelId !== null}
        <button
          type="button"
          class="name link"
          {disabled}
          title={`Show images made with ${resource.name}`}
          onclick={() => onpick(resource)}>{resource.name}</button
        >
      {:else}
        <span class="name" title={resource.name}>{resource.name}</span>
      {/if}
      {#if resource.hash}
        <span class="hash" title={resource.hash}>{shortHash(resource.hash)}</span>
      {/if}
      <span class="badge kind">{resourceKindLabel(resource.kind)}</span>
      {#if resource.kind === ResourceKind.Lora}
        <span class="badge weight" title={weightTitle(resource)}>
          {resource.weight ?? '—'}
        </span>
      {/if}
    </li>
  {/each}
</ul>
{#if resources.length > limit}
  <button type="button" class="more" onclick={() => (showAll = !showAll)}>
    {showAll ? 'Show fewer' : `Show all ${resources.length}`}
  </button>
{/if}

<style>
  .resources {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--color-surface-raised);
    border-radius: var(--radius-1);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .link {
    padding: 0;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .link:hover,
  .link:focus-visible {
    color: var(--color-accent);
    text-decoration: underline;
  }
  .hash {
    color: var(--color-text-muted);
    font-family: ui-monospace, monospace;
    font-size: 0.85em;
  }
  .badge {
    padding: 0 var(--space-2);
    border-radius: var(--radius-1);
    font-size: 0.8em;
    text-transform: uppercase;
    background: var(--color-bg);
  }
  .weight {
    min-width: 2.5em;
    text-align: center;
    background: var(--color-selected);
  }
  .more {
    margin-top: var(--space-1);
    padding: 0;
    background: none;
    border: none;
    color: var(--color-accent);
    cursor: pointer;
  }
</style>
