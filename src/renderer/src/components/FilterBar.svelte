<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import { GeneratorKind } from '@shared/generation-kinds'
  import { KeywordScope, SetMatchMode } from '@shared/search-kinds'
  import type { FacetValue, SearchFilters } from '@shared/search'
  import { getAppServices } from '../lib/app-context'
  import { generatorLabel } from '../lib/format/generation-labels'
  import { isGalleryRoute, RouteKind, withFilters } from '../lib/routing/route'
  import FacetPicker from './FacetPicker.svelte'
  import SaveSmartAlbum from './SaveSmartAlbum.svelte'

  const { router, facets } = getAppServices()
  const KEYWORD_DELAY_MS = 300

  const route = $derived(isGalleryRoute(router.route) ? router.route : undefined)
  const filters: SearchFilters = $derived(route?.filters ?? {})
  const checkpoints = $derived(facets.facets?.checkpoints ?? [])
  const loras = $derived(facets.facets?.loras ?? [])
  const tagFacets = $derived(facets.facets?.tags ?? [])
  /** Shown in the pickers only when there are no facets at all to fall back on. */
  const facetsError = $derived(facets.facets ? undefined : facets.loadError)
  const generators = $derived(
    Object.values(GeneratorKind).filter(
      (kind) =>
        facets.facets?.generators.some((facet) => facet.kind === kind) ||
        filters.generators?.includes(kind)
    )
  )

  /** Navigates to the same scope with `next` filters; unset fields are dropped. */
  function apply(next: SearchFilters, history: 'push' | 'replace' = 'push'): void {
    if (!route) return
    const compact = Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== undefined)
    ) as SearchFilters
    const target = withFilters(route, compact)
    if (history === 'replace') router.replace(target)
    else router.navigate(target)
  }

  // Keyword typing updates the route after a pause; Enter applies at once.
  let keyword = $state('')
  let keywordTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const routed = filters.keywords?.query ?? ''
    untrack(() => {
      // Only when the route says something else (back, forward, Clear): rewriting the input
      // with the trimmed query would eat a space typed just before a pause.
      if (keywordTimer === undefined && routed !== keyword.trim()) keyword = routed
    })
  })
  onDestroy(() => clearTimeout(keywordTimer))

  function applyKeyword(): void {
    clearTimeout(keywordTimer)
    keywordTimer = undefined
    const query = keyword.trim()
    const current = filters.keywords?.query ?? ''
    if (query === current) return
    // Refining an existing search replaces its history entry, so Back skips the drafts typed
    // along the way; starting or clearing a search adds one.
    apply(
      {
        ...filters,
        keywords: query
          ? { query, scope: filters.keywords?.scope ?? KeywordScope.Positive }
          : undefined
      },
      current && query ? 'replace' : 'push'
    )
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
    // A new bound that crosses the other one replaces it: the range must stay min ≤ max.
    if (
      next.minWeight !== undefined &&
      next.maxWeight !== undefined &&
      next.minWeight > next.maxWeight
    ) {
      if ('minWeight' in changes) delete next.maxWeight
      else delete next.minWeight
    }
    for (const bound of ['minWeight', 'maxWeight'] as const) {
      if (next[bound] === undefined) delete next[bound]
    }
    apply({ ...filters, loras: next.ids.length > 0 ? next : undefined })
  }

  /** Included tags, their match mode and excluded tags; an empty filter is dropped. */
  function setTags(changes: Partial<NonNullable<SearchFilters['tags']>>): void {
    const next = { mode: SetMatchMode.Any, ...filters.tags, ...changes }
    const ids = next.ids?.length ? next.ids : undefined
    const excludeIds = next.excludeIds?.length ? next.excludeIds : undefined
    apply({
      ...filters,
      tags:
        ids || excludeIds
          ? { mode: next.mode, ...(ids ? { ids } : {}), ...(excludeIds ? { excludeIds } : {}) }
          : undefined
    })
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
    if (filters.tags?.ids) {
      const names = filters.tags.ids.map((id) => nameOf(tagFacets, id)).join(', ')
      const mode = filters.tags.ids.length > 1 ? ` (${filters.tags.mode})` : ''
      list.push({ label: `Tag${mode}: ${names}`, remove: () => setTags({ ids: [] }) })
    }
    if (filters.tags?.excludeIds) {
      const names = filters.tags.excludeIds.map((id) => nameOf(tagFacets, id)).join(', ')
      list.push({ label: `Without: ${names}`, remove: () => setTags({ excludeIds: [] }) })
    }
    if (filters.untagged) list.push({ label: 'Not tagged', remove: without('untagged') })
    if (filters.unalbumed) list.push({ label: 'No album', remove: without('unalbumed') })
    if (filters.favoritesOnly) {
      list.push({ label: 'Favourites', remove: without('favoritesOnly') })
    }
    if (filters.minRating !== undefined) {
      list.push({ label: `${'★'.repeat(filters.minRating)} or more`, remove: without('minRating') })
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
        error={facetsError}
        selected={filters.checkpointIds ?? []}
        onchange={setCheckpoints}
      />
      <FacetPicker
        label="LoRA"
        values={loras}
        error={facetsError}
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
      <FacetPicker
        label="Tags"
        values={tagFacets}
        error={facetsError}
        selected={filters.tags?.ids ?? []}
        onchange={(ids) => setTags({ ids })}
      >
        <fieldset class="tag-mode">
          <legend>Images with</legend>
          <label>
            <input
              type="radio"
              name="tag-mode"
              checked={(filters.tags?.mode ?? SetMatchMode.Any) === SetMatchMode.Any}
              onchange={() => setTags({ mode: SetMatchMode.Any })}
            /> any selected
          </label>
          <label>
            <input
              type="radio"
              name="tag-mode"
              checked={filters.tags?.mode === SetMatchMode.All}
              onchange={() => setTags({ mode: SetMatchMode.All })}
            /> all selected
          </label>
        </fieldset>
      </FacetPicker>
      <FacetPicker
        label="Without tags"
        values={tagFacets}
        error={facetsError}
        selected={filters.tags?.excludeIds ?? []}
        onchange={(excludeIds) => setTags({ excludeIds })}
      />
      <button
        type="button"
        class="chip-toggle"
        aria-pressed={filters.untagged === true}
        onclick={() => apply({ ...filters, untagged: filters.untagged ? undefined : true })}
        >Not Tagged</button
      >
      <button
        type="button"
        class="chip-toggle"
        aria-pressed={filters.unalbumed === true}
        onclick={() => apply({ ...filters, unalbumed: filters.unalbumed ? undefined : true })}
        >No Album</button
      >
      <button
        type="button"
        class="chip-toggle"
        aria-pressed={filters.favoritesOnly === true}
        onclick={() =>
          apply({ ...filters, favoritesOnly: filters.favoritesOnly ? undefined : true })}
        >♥ Favourites</button
      >
      <select
        aria-label="Minimum rating"
        value={String(filters.minRating ?? 0)}
        onchange={(event) => {
          const rating = Number(event.currentTarget.value)
          apply({ ...filters, minRating: rating > 0 ? rating : undefined })
        }}
      >
        <option value="0">Any rating</option>
        {#each [1, 2, 3, 4, 5] as rating (rating)}
          <option value={String(rating)}>{'★'.repeat(rating)} or more</option>
        {/each}
      </select>
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
        <!-- A smart album saves filters only, so only a library-wide search is offered. -->
        {#if route?.kind === RouteKind.All}
          <li><SaveSmartAlbum {filters} /></li>
        {/if}
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
  .tag-mode {
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
