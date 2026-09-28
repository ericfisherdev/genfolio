<script lang="ts">
  import { getAppServices } from '../lib/app-context'

  interface Props {
    groupId: number
  }

  let { groupId }: Props = $props()
  const { similarity, gallery, api } = getAppServices()
  const count = new Intl.NumberFormat()

  let members: number[] = $state([])
  let keeperName: string | undefined = $state()
  let latest = 0

  // The keeper follows the user's choice, the group's contents and regrouping; an answer
  // overtaken by a newer request is dropped.
  $effect(() => {
    void similarity.chosenKeepers.get(groupId)
    void gallery.layout
    const request = ++latest
    void similarity.membersKeeperFirst(groupId).then(async (ids) => {
      const [keeper] = ids
      const name =
        keeper === undefined
          ? undefined
          : (gallery.card(keeper)?.fileName ?? (await api.getImages([keeper]))[0]?.fileName)
      if (request !== latest) return
      members = ids
      keeperName = name
    })
  })

  const chosen = $derived(similarity.chosenKeepers.has(groupId))
  const others = $derived(Math.max(members.length - 1, 0))
</script>

{#if members.length > 1}
  <div class="keeper" role="region" aria-label="Keeper">
    <span>
      Keeper: <strong>{keeperName ?? '…'}</strong>
      <span class="how">({chosen ? 'your choice' : 'suggested: most pixels, largest, oldest'})</span
      >
    </span>
    <button type="button" class="danger" onclick={() => void similarity.trashAllButKeeper(groupId)}
      >Move the other {count.format(others)} to trash</button
    >
  </div>
{/if}

<style>
  .keeper {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }
  .how {
    color: var(--color-text-muted);
  }
  button {
    margin-left: auto;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
  .danger {
    color: var(--color-danger);
  }
</style>
