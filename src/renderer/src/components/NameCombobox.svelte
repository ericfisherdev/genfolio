<script lang="ts" generics="T extends NamedItem">
  import { nameKey } from '@shared/name-key'
  import type { NamedItem } from './named-item'

  interface Props {
    /** Every item that can be picked, such as the library's tags or albums. */
    items: readonly T[]
    /** Ids already chosen, left out of the suggestions. */
    excluded: readonly number[]
    /** A chosen item, or the typed name when it names no item yet. */
    onpick: (choice: T | string) => void
    /** Longest name that can be created. */
    maxName: number
    label: string
    /** The accessible name of the suggestion list. */
    listLabel: string
  }

  let { items, excluded, onpick, maxName, label, listLabel }: Props = $props()
  const MAX_SUGGESTIONS = 8
  const uid = $props.id()
  const listId = `${uid}-options`

  let text = $state('')
  let open = $state(false)
  let active = $state(-1)

  const typed = $derived(text.trim())
  const exact = $derived(items.find((item) => nameKey(item.name) === nameKey(typed)))
  const options = $derived.by((): (T | string)[] => {
    const key = nameKey(typed)
    const matches = items
      .filter((item) => !excluded.includes(item.id) && nameKey(item.name).includes(key))
      .slice(0, MAX_SUGGESTIONS)
    const canCreate = typed.length > 0 && typed.length <= maxName && exact === undefined
    return canCreate ? [...matches, typed] : matches
  })
  const expanded = $derived(open && options.length > 0)

  function pick(choice: T | string): void {
    onpick(choice)
    text = ''
    active = -1
    open = false
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      open = true
      active = Math.min(active + 1, options.length - 1)
    } else if (event.key === 'ArrowUp') {
      active = Math.max(active - 1, -1)
    } else if (event.key === 'Enter') {
      const choice = options[active] ?? exact ?? (typed ? typed : undefined)
      if (choice === undefined) return
      if (typeof choice !== 'string' && excluded.includes(choice.id)) return
      pick(choice)
    } else if (event.key === 'Escape') {
      if (!expanded && !text) return
      text = ''
      open = false
    } else {
      return
    }
    event.preventDefault()
    // Keys handled here belong to the combobox, not the page's shortcuts.
    event.stopPropagation()
  }
</script>

<div class="combobox">
  <input
    type="text"
    role="combobox"
    aria-label={label}
    aria-autocomplete="list"
    aria-expanded={expanded}
    aria-controls={listId}
    aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
    placeholder={`${label}…`}
    maxlength={maxName}
    bind:value={text}
    oninput={() => {
      open = true
      active = -1
    }}
    onfocus={() => (open = true)}
    onblur={() => (open = false)}
    {onkeydown}
  />
  {#if expanded}
    <ul id={listId} role="listbox" aria-label={listLabel}>
      {#each options as option, index (typeof option === 'string' ? `new:${option}` : option.id)}
        <li
          id={`${listId}-${index}`}
          role="option"
          aria-selected={index === active}
          class:active={index === active}
          onpointerdown={(event) => {
            // Keeps focus in the input so blur doesn't close the list before the pick.
            event.preventDefault()
            pick(option)
          }}
        >
          {#if typeof option === 'string'}
            Create “{option}”
          {:else}
            {option.name} <span class="count">{option.imageCount}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .combobox {
    position: relative;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: inherit;
  }
  ul {
    position: absolute;
    z-index: 10;
    left: 0;
    right: 0;
    top: calc(100% + 2px);
    margin: 0;
    padding: var(--space-1);
    list-style: none;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    box-shadow: 0 8px 24px rgb(0 0 0 / 40%);
  }
  li {
    display: flex;
    justify-content: space-between;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-1);
    cursor: pointer;
  }
  li.active,
  li:hover {
    background: var(--color-selected);
  }
  .count {
    color: var(--color-text-muted);
  }
</style>
