import type { DirectoryId } from '@domain/library'
import type { GenerationSourceParser } from '@domain/generation'
import type { GenerationMerger } from '@domain/generation-merger'
import type { MetadataRecord } from '@domain/metadata-record'
import type {
  GenerationRepository,
  ImageVersion,
  MetadataRecordRepository
} from '@domain/repositories'
import type { MetadataOrigin } from '@shared/metadata-kinds'

/** Stores an image's raw metadata records and the generation merged from them. */
export class ImageMetadataIndex {
  constructor(
    private readonly parser: GenerationSourceParser,
    private readonly merger: GenerationMerger,
    private readonly records: MetadataRecordRepository,
    private readonly generations: GenerationRepository
  ) {}

  /**
   * Replaces the records and generation of an image row written, or read, earlier in the
   * current transaction, where nothing can have changed it since. Call inside that
   * transaction so both writes land together.
   */
  index(version: ImageVersion, records: readonly MetadataRecord[]): void {
    this.records.replaceFresh(version.id, records)
    this.generations.replaceFresh(version.id, this.merger.merge(this.parser.parse(records)))
  }

  /** The records stored for an image, as last indexed. */
  storedRecords(version: ImageVersion): MetadataRecord[] {
    return this.records.list(version.id)
  }

  /**
   * The value of each image's stored record with this origin and key in the directory, by
   * file name; images without one are left out.
   */
  storedValuesInDirectory(
    directoryId: DirectoryId,
    origin: MetadataOrigin,
    key: string
  ): Map<string, string> {
    return this.records.valuesInDirectory(directoryId, origin, key)
  }

  /** Deletes checkpoints and LoRAs no generation uses any more. */
  pruneUnusedModels(): number {
    return this.generations.pruneUnusedModels()
  }
}
