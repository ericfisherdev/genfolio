<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import { GeneratorKind } from '@shared/generation-kinds'
  import { KeywordScope, SetMatchMode } from '@shared/search-kinds'
  import type { FacetValue, SearchFilters } from '@shared/search'
  import { getAppServices } from '../lib/app-context'
  import { generatorLabel } from '../lib/format/generation-labels'
  import { RouteKind, withFilters } from '../lib/routing/route'
  import FacetPicker from './FacetPicker.svelte'

  const { router, facets } = getAppServices()
  const KEYWORD_DELAY_MS = 300

  const route = $derived(router.route.kind === RouteKind.Image ? undefined : router.route)
  const filters: SearchFilters = $derived(route?.filters ?? {})
  const checkpoints = $derived(facets.facets?.checkpoints ?? [])
  const loras = $derived(facets.facets?.loras ?? [])
  const generators = $derived(
    Object.values(GeneratorKind).filter(
      (kind) =>
        facets.facets?.generators.some((facet) => facet.kind === kind) ||
        filters.generators?.includes(kind)
    )
  )

  /** Navigates to the same scope with `next` filters; unset fields are dropped. */
  function apply(next: SearchFilters): void {
    if (!route) return
    const compact = Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== undefined)
    ) as SearchFilters
    router.navigate(withFilters(route, compact))
  }

  // Keyword typing updates the route after a pause; Enter applies at once.
  let keyword = $state('')
  let keywordTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const routed = filters.keywords?.query ?? ''
    untrack(() => {
      if (keywordTimer === undefined) keyword = routed
    })
  })
  onDestroy(() => clearTimeout(keywordTimer))

  function applyKeyword(): void {
    clearTimeout(keywordTimer)
    keywordTimer = undefined
    const query = keyword.trim()
    apply({
      ...filters,
      keywords: query
        ? { query, scope: filters.keywords?.scope ?? KeywordScope.Positive }
        : undefined
    })
  }

  function onkeywordinput(): void {
    clearTimeout(keywordTimer)
    keywordTimer = setTimeout(applyKeyword, KEYWORD_DELAY_MS)
  }

  function setScope(scope: KeywordScope): void {
    if (filters.keywords) apply({ ...filters, keywords: { ...filters.keywords, scope } })
  }

  const setCheckpoints = (ids: number[]): void =>
    apply({ ...filters, checkpointIds: ids.length > 0 ? ids : undefined })

  function setLoras(changes: Partial<NonNullable<SearchFilters['loras']>>): void {
    const current = filters.loras ?? { ids: [], mode: SetMatchMode.Any }
    const next = { ...current, ...changes }
    for (const bound of ['minWeight', 'maxWeight'] as const) {
      if (next[bound] === undefined) delete next[bound]
    }
    apply({ ...filters, loras: next.ids.length > 0 ? next : undefined })
  }

  function weight(event: Event): number | undefined {
    const value = (event.currentTarget as HTMLInputElement).value
    const number = Number(value)
    return value.trim() === '' || !Number.isFinite(number) ? undefined : number
  }

  function toggleGenerator(kind: GeneratorKind): void {
    const current = filters.generators ?? []
    const next = current.includes(kind)
      ? current.filter((other) => other !== kind)
      : [...current, kind]
    apply({ ...filters, generators: next.length > 0 ? next : undefined })
  }

  const nameOf = (values: readonly FacetValue[], id: number): string =>
    values.find((value) => value.id === id)?.name ?? `#${id}`

  /** Every active filter as a removable chip. */
  const chips = $derived.by((): { label: string; remove: () => void }[] => {
    const list: { label: string; remove: () => void }[] = []
    const without = (key: keyof SearchFilters) => () => apply({ ...filters, [key]: undefined })
    if (filters.keywords) {
      const scope =
        filters.keywords.scope === KeywordScope.Positive ? '' : ` (${filters.keywords.scope})`
      list.push({ label: `“${filters.keywords.query}”${scope}`, remove: without('keywords') })
    }
    if (filters.checkpointIds) {
      const names = filters.checkpointIds.map((id) => nameOf(checkpoints, id)).join(', ')
      list.push({ label: `Checkpoint: ${names}`, remove: without('checkpointIds') })
    }
    if (filters.loras) {
      const names = filters.loras.ids.map((id) => nameOf(loras, id)).join(', ')
      const mode = filters.loras.ids.length > 1 ? ` (${filters.loras.mode})` : ''
      list.push({ label: `LoRA${mode}: ${names}`, remove: without('loras') })
    }
    if (filters.generators) {
      const names = filters.generators.map(generatorLabel).join(', ')
      list.push({ label: `Generator: ${names}`, remove: without('generators') })
    }
    if (filters.seed !== undefined) {
      list.push({ label: `Seed: ${filters.seed}`, remove: without('seed') })
    }
    if (filters.samePromptAs !== undefined) {
      list.push({ label: 'Same prompt', remove: without('samePromptAs') })
    }
    if (filters.hasMetadata !== undefined) {
      list.push({
        label: filters.hasMetadata ? 'With generation data' : 'Without generation data',
        remove: without('hasMetadata')
      })
    }
    return list
  })
</script>

{#if route}
  <div class="filter-bar" role="search" aria-label="Filter images">
    <div class="controls">
      <input
        type="search"
        class="keyword"
        placeholder="Search prompts…"
        aria-label="Search prompts"
        bind:value={keyword}
        oninput={onkeywordinput}
        onkeydown={(event) => event.key === 'Enter' && applyKeyword()}
      />
      <select
        aria-label="Search in"
        value={filters.keywords?.scope ?? KeywordScope.Positive}
        disabled={!filters.keywords}
        onchange={(event) => setScope(event.currentTarget.value as KeywordScope)}
      >
        <option value={KeywordScope.Positive}>Prompt</option>
        <option value={KeywordScope.Negative}>Negative prompt</option>
        <option value={KeywordScope.Both}>Both</option>
      </select>
      <FacetPicker
        label="Checkpoint"
        values={checkpoints}
        selected={filters.checkpointIds ?? []}
        onchange={setCheckpoints}
      />
      <FacetPicker
        label="LoRA"
        values={loras}
        selected={filters.loras?.ids ?? []}
        onchange={(ids) => setLoras({ ids })}
      >
        <div class="lora-options">
          <fieldset>
            <legend>Images with</legend>
            <label>
              <input
                type="radio"
                name="lora-mode"
                checked={(filters.loras?.mode ?? SetMatchMode.Any) === SetMatchMode.Any}
                onchange={() => setLoras({ mode: SetMatchMode.Any })}
              /> any selected
            </label>
            <label>
              <input
                type="radio"
                name="lora-mode"
                checked={filters.loras?.mode === SetMatchMode.All}
                onchange={() => setLoras({ mode: SetMatchMode.All })}
              /> all selected
            </label>
          </fieldset>
          <label>
            Weight from
            <input
              type="number"
              step="0.05"
              aria-label="Minimum LoRA weight"
              value={filters.loras?.minWeight ?? ''}
              onchange={(event) => setLoras({ minWeight: weight(event) })}
            />
          </label>
          <label>
            to
            <input
              type="number"
              step="0.05"
              aria-label="Maximum LoRA weight"
              value={filters.loras?.maxWeight ?? ''}
              onchange={(event) => setLoras({ maxWeight: weight(event) })}
            />
          </label>
        </div>
      </FacetPicker>
      {#each generators as kind (kind)}
        <button
          type="button"
          class="chip-toggle"
          aria-pressed={filters.generators?.includes(kind) ?? false}
          onclick={() => toggleGenerator(kind)}>{generatorLabel(kind)}</button
        >
      {/each}
    </div>
    {#if chips.length > 0}
      <ul class="active" aria-label="Active filters">
        {#each chips as chip (chip.label)}
          <li>
            <span>{chip.label}</span>
            <button type="button" aria-label={`Remove ${chip.label}`} onclick={chip.remove}
              >✕</button
            >
          </li>
        {/each}
        <li>
          <button type="button" class="clear" onclick={() => apply({})}>Clear all</button>
        </li>
      </ul>
    {/if}
  </div>
{/if}

<style>
  .filter-bar {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .keyword {
    flex: 1;
    min-width: 200px;
    max-width: 420px;
  }
  .keyword,
  select,
  input[type='number'] {
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: inherit;
  }
  input[type='number'] {
    width: 5em;
  }
  .lora-options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.9em;
  }
  fieldset {
    display: flex;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: none;
  }
  legend {
    float: left;
    color: var(--color-text-muted);
    margin-right: var(--space-2);
  }
  .chip-toggle {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
  .chip-toggle[aria-pressed='true'] {
    background: var(--color-selected);
    border-color: var(--color-accent);
  }
  .active {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .active li {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-1) 0 var(--space-2);
    background: var(--color-selected);
    border-radius: 999px;
  }
  .active button {
    background: none;
    border: none;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .active .clear {
    color: var(--color-accent);
  }
</style>
