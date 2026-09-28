<script lang="ts">
  import { MAX_ALBUM_NAME } from '@shared/albums'
  import type { SearchFilters } from '@shared/search'
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'
  import PromptDialog from './PromptDialog.svelte'

  interface Props {
    /** The library-wide search to save. */
    filters: SearchFilters
  }

  let { filters }: Props = $props()
  const { albums, router } = getAppServices()
  let naming = $state(false)

  async function save(name: string): Promise<void> {
    naming = false
    const album = await albums.createSmart(name, filters)
    if (album) router.navigate({ kind: RouteKind.Album, albumId: album.id })
  }
</script>

<button type="button" class="save" onclick={() => (naming = true)}>Save as smart album…</button>

<PromptDialog
  open={naming}
  title="Save as smart album"
  label="Name"
  initial=""
  confirmLabel="Save"
  maxlength={MAX_ALBUM_NAME}
  onconfirm={(name) => void save(name)}
  oncancel={() => (naming = false)}
/>

<style>
  .save {
    background: none;
    border: none;
    color: var(--color-accent);
    font-weight: 600;
    cursor: pointer;
  }
</style>
