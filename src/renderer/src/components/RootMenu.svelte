<script lang="ts">
  import ActionMenu from './ActionMenu.svelte'

  interface Props {
    rootLabel: string
    onrescan: () => void
    onremove: () => void
  }

  let { rootLabel, onrescan, onremove }: Props = $props()
</script>

<ActionMenu
  label={`Actions for ${rootLabel}`}
  actions={[
    { label: 'Rescan', onselect: onrescan },
    { label: 'Remove from library…', danger: true, onselect: onremove }
  ]}
/>
