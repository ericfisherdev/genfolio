import type { SmartAlbumEvaluator, StoredFilterCodec } from '@domain/albums'
import type { ImageId } from '@domain/library'
import {
  type AlbumRecord,
  type AlbumRepository,
  DuplicateAlbumError,
  UnknownAlbumError
} from '@domain/repositories'
import { AlbumKind, type AlbumChange, ChangeOutcome } from '@shared/albums'
import type { SearchFilters } from '@shared/search'

/**
 * Album commands for the UI: a duplicate name or an album that is gone become outcomes
 * rather than failures, as for tags. Membership and order commands on an album that is gone
 * (or smart) change nothing and say so by their count. A smart album's size and default
 * cover are evaluated from its saved search whenever albums are read.
 */
export class AlbumService {
  constructor(
    private readonly albums: AlbumRepository,
    private readonly codec: StoredFilterCodec,
    private readonly smart: SmartAlbumEvaluator,
    private readonly now: () => number
  ) {}

  list(): AlbumRecord[] {
    return this.albums.list().map((album) => this.withContents(album))
  }

  create(name: string): AlbumChange {
    return this.outcome(() => this.albums.create(name, this.now()))
  }

  /** Saves `filters` as a smart album, naming models, tags and the prompt rather than ids. */
  createSmart(name: string, filters: SearchFilters): AlbumChange {
    return this.outcome(() => this.albums.createSmart(name, this.codec.store(filters), this.now()))
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

  private withContents(album: AlbumRecord): AlbumRecord {
    if (album.kind !== AlbumKind.Smart) return album
    const contents = this.smart.contents(album.id)
    return {
      ...album,
      imageCount: contents.imageCount,
      coverImageId: album.coverImageId ?? contents.firstImageId
    }
  }

  private outcome(change: () => AlbumRecord): AlbumChange {
    try {
      return { outcome: ChangeOutcome.Done, album: this.withContents(change()) }
    } catch (error) {
      if (error instanceof DuplicateAlbumError) {
        return { outcome: ChangeOutcome.Duplicate, existing: this.withContents(error.existing) }
      }
      if (error instanceof UnknownAlbumError) return { outcome: ChangeOutcome.Missing }
      throw error
    }
  }
}
