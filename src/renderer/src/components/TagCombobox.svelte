<script lang="ts">
  import { nameKey } from '@shared/name-key'
  import { MAX_TAG_NAME } from '@shared/tag-kinds'
  import type { Tag } from '@shared/tags'

  interface Props {
    /** Every tag in the library. */
    tags: readonly Tag[]
    /** Tags already applied, left out of the suggestions. */
    applied: readonly number[]
    /** A chosen tag, or the typed name when it names no tag yet. */
    onpick: (choice: Tag | string) => void
    label?: string
  }

  let { tags, applied, onpick, label = 'Add a tag' }: Props = $props()
  const MAX_SUGGESTIONS = 8
  const listId = `tag-options-${Math.random().toString(36).slice(2)}`

  let text = $state('')
  let open = $state(false)
  let active = $state(-1)

  const typed = $derived(text.trim())
  const exact = $derived(tags.find((tag) => nameKey(tag.name) === nameKey(typed)))
  const options = $derived.by((): (Tag | string)[] => {
    const key = nameKey(typed)
    const matches = tags
      .filter((tag) => !applied.includes(tag.id) && nameKey(tag.name).includes(key))
      .slice(0, MAX_SUGGESTIONS)
    const canCreate = typed.length > 0 && typed.length <= MAX_TAG_NAME && exact === undefined
    return canCreate ? [...matches, typed] : matches
  })
  const expanded = $derived(open && options.length > 0)

  function pick(choice: Tag | string): void {
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
      if (typeof choice !== 'string' && applied.includes(choice.id)) return
      pick(choice)
    } else if (event.key === 'Escape') {
      if (!expanded && !text) return
      text = ''
      open = false
    } else {
      return
    }
    event.preventDefault()
    // Keys handled here belong to the combobox, not the detail view's shortcuts.
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
    maxlength={MAX_TAG_NAME}
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
    <ul id={listId} role="listbox" aria-label="Tags">
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
