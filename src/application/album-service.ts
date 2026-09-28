import type { ImageId } from '@domain/library'
import {
  type AlbumRecord,
  type AlbumRepository,
  DuplicateAlbumError,
  UnknownAlbumError
} from '@domain/repositories'
import { type AlbumChange, ChangeOutcome } from '@shared/albums'

/**
 * Album commands for the UI: a duplicate name or an album that is gone become outcomes
 * rather than failures, as for tags. Membership and order commands on an album that is gone
 * (or smart) change nothing and say so by their count.
 */
export class AlbumService {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly now: () => number
  ) {}

  list(): AlbumRecord[] {
    return this.albums.list()
  }

  create(name: string): AlbumChange {
    return this.outcome(() => this.albums.create(name, this.now()))
  }

  rename(id: number, name: string): AlbumChange {
    return this.outcome(() => this.albums.rename(id, name))
  }

  setCover(id: number, imageId: ImageId | null): AlbumChange {
    return this.outcome(() => this.albums.setCover(id, imageId))
  }

  delete(id: number): boolean {
    return this.albums.delete(id)
  }

  add(albumId: number, imageIds: readonly ImageId[]): number {
    return this.albums.add(albumId, imageIds)
  }

  remove(albumId: number, imageIds: readonly ImageId[]): number {
    return this.albums.remove(albumId, imageIds)
  }

  move(albumId: number, imageIds: readonly ImageId[], beforeId: ImageId | null): number {
    return this.albums.move(albumId, imageIds, beforeId)
  }

  private outcome(change: () => AlbumRecord): AlbumChange {
    try {
      return { outcome: ChangeOutcome.Done, album: change() }
    } catch (error) {
      if (error instanceof DuplicateAlbumError) {
        return { outcome: ChangeOutcome.Duplicate, existing: error.existing }
      }
      if (error instanceof UnknownAlbumError) return { outcome: ChangeOutcome.Missing }
      throw error
    }
  }
}
