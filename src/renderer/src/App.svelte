<script lang="ts">
  import { onMount } from 'svelte'
  import { getAppServices } from './lib/app-context'
  import AppShell from './components/AppShell.svelte'

  const { library } = getAppServices()

  onMount(() => {
    void library.refresh()
  })
</script>

<AppShell />
