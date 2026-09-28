<script lang="ts">
  import { AlbumKind, MAX_ALBUM_NAME, type Album } from '@shared/albums'
  import { getAppServices } from '../lib/app-context'
  import NameCombobox from './NameCombobox.svelte'

  interface Props {
    /** The images to add; the dialog is open while this is set. */
    imageIds: readonly number[] | undefined
    onclose: () => void
  }

  let { imageIds, onclose }: Props = $props()
  const { albums, library } = getAppServices()
  const uid = $props.id()
  const titleId = `${uid}-title`
  const count = new Intl.NumberFormat()
  let dialog: HTMLDialogElement | undefined = $state()

  const manual = $derived(albums.albums.filter((album) => album.kind === AlbumKind.Manual))
  const images = (n: number): string => `${count.format(n)} image${n === 1 ? '' : 's'}`

  $effect(() => {
    if (!dialog) return
    if (imageIds && !dialog.open) dialog.showModal()
    if (!imageIds && dialog.open) dialog.close()
  })

  async function add(choice: Album | string): Promise<void> {
    const ids = imageIds
    onclose()
    if (!ids) return
    const album = typeof choice === 'string' ? await albums.ensure(choice) : choice
    if (!album) return
    const added = await albums.add(album, ids)
    if (added === undefined) return
    const already = ids.length - added
    library.notify(
      `Added ${images(added)} to “${album.name}”.` +
        (already > 0 ? ` ${images(already)} ${already === 1 ? 'was' : 'were'} already in it.` : '')
    )
  }
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} oncancel={onclose}>
  <h2 id={titleId}>Add {images(imageIds?.length ?? 0)} to an album</h2>
  <p>Pick an album, or type a new name to create one.</p>
  <NameCombobox
    items={manual}
    excluded={[]}
    onpick={(choice) => void add(choice)}
    maxName={MAX_ALBUM_NAME}
    label="Album"
    listLabel="Albums"
  />
  <div class="actions">
    <button type="button" onclick={onclose}>Cancel</button>
  </div>
</dialog>

<style>
  dialog {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    width: 360px;
    padding: var(--space-5);
    overflow: visible;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 50%);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: 1.1rem;
  }
  p {
    margin: 0 0 var(--space-3);
    color: var(--color-text-muted);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-4);
  }
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
</style>
