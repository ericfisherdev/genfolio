import { type Album, type AlbumChange, ChangeOutcome, MAX_IDS_PER_ALBUM_EDIT } from '@shared/albums'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { SearchFilters } from '@shared/search'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type AlbumsApi = Pick<
  GenfolioApi,
  | 'listAlbums'
  | 'createAlbum'
  | 'createSmartAlbum'
  | 'renameAlbum'
  | 'deleteAlbum'
  | 'setAlbumCover'
  | 'addToAlbum'
  | 'removeFromAlbum'
  | 'moveInAlbum'
>

/**
 * The library's albums with sizes and covers, and the commands that change them. Every
 * command reports problems (a duplicate name, an album that's gone, a failure) in the notice
 * bar, reloads the list and calls `onchange` so an open album view refreshes. Never rejects.
 */
export class AlbumsState {
  albums: readonly Album[] = $state.raw([])
  /** Whether the list has loaded once, so a missing album can be told from a loading one. */
  loaded = $state(false)

  constructor(
    private readonly api: AlbumsApi,
    private readonly notices: NoticeSink,
    private readonly onchange: () => void
  ) {}

  find(albumId: number): Album | undefined {
    return this.albums.find((album) => album.id === albumId)
  }

  async load(): Promise<void> {
    try {
      this.albums = await this.api.listAlbums()
      this.loaded = true
    } catch (error) {
      this.notices.notify(`Could not load albums: ${userMessage(error)}`)
    }
  }

  /** The album with this name, creating an empty one when there's none; `undefined` on failure. */
  async ensure(name: string): Promise<Album | undefined> {
    const change = await this.attempt('create the album', () => this.api.createAlbum(name))
    if (change?.outcome === ChangeOutcome.Done) return change.album
    if (change?.outcome === ChangeOutcome.Duplicate) return change.existing
    return undefined
  }

  /** Saves the filters as a smart album; `undefined` (with a notice) when it wasn't created. */
  async createSmart(name: string, filters: SearchFilters): Promise<Album | undefined> {
    const change = await this.attempt('save the smart album', () =>
      this.api.createSmartAlbum(name, filters)
    )
    this.report(change, `An album named “${name}” already exists.`)
    return change?.outcome === ChangeOutcome.Done ? change.album : undefined
  }

  async rename(album: Album, name: string): Promise<void> {
    const change = await this.attempt('rename the album', () =>
      this.api.renameAlbum(album.id, name)
    )
    this.report(change, `An album named “${name}” already exists.`)
  }

  async delete(album: Album): Promise<void> {
    await this.attempt('delete the album', () => this.api.deleteAlbum(album.id))
  }

  /** `null` goes back to the album's first image. */
  async setCover(album: Album, imageId: number | null): Promise<void> {
    const change = await this.attempt('set the cover', () =>
      this.api.setAlbumCover(album.id, imageId)
    )
    this.report(change, '')
  }

  /** Resolves how many images were new to the album, or `undefined` when it failed. */
  add(album: Album, imageIds: readonly number[]): Promise<number | undefined> {
    return this.inChunks('add to the album', imageIds, (chunk) =>
      this.api.addToAlbum(album.id, chunk)
    )
  }

  /** Resolves how many entries were removed, or `undefined` when it failed. */
  remove(album: Album, imageIds: readonly number[]): Promise<number | undefined> {
    return this.inChunks('remove from the album', imageIds, (chunk) =>
      this.api.removeFromAlbum(album.id, chunk)
    )
  }

  /**
   * Moves the images to just before `beforeId` (null: the end), keeping their album order.
   * Chunks land one after another before the same image, so the order holds across them.
   */
  async move(album: Album, imageIds: readonly number[], beforeId: number | null): Promise<void> {
    await this.inChunks('move the images', imageIds, (chunk) =>
      this.api.moveInAlbum(album.id, chunk, beforeId)
    )
  }

  private async inChunks(
    description: string,
    imageIds: readonly number[],
    send: (chunk: readonly number[]) => Promise<number>
  ): Promise<number | undefined> {
    if (imageIds.length === 0) return 0
    return this.attempt(description, async () => {
      let total = 0
      for (let start = 0; start < imageIds.length; start += MAX_IDS_PER_ALBUM_EDIT) {
        total += await send(imageIds.slice(start, start + MAX_IDS_PER_ALBUM_EDIT))
      }
      return total
    })
  }

  /** Runs a command, then reloads; `undefined` (with a notice) when it failed. */
  private async attempt<T>(description: string, command: () => Promise<T>): Promise<T | undefined> {
    try {
      return await command()
    } catch (error) {
      this.notices.notify(`Could not ${description}: ${userMessage(error)}`)
      return undefined
    } finally {
      await this.load()
      this.onchange()
    }
  }

  private report(change: AlbumChange | undefined, duplicate: string): void {
    if (change?.outcome === ChangeOutcome.Duplicate && duplicate) this.notices.notify(duplicate)
    if (change?.outcome === ChangeOutcome.Missing) {
      this.notices.notify('That album no longer exists.')
    }
  }
}
