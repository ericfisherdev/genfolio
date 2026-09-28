import type { GenerationSourceParser } from '@domain/generation'
import type { GenerationMerger } from '@domain/generation-merger'
import type { MetadataRecord } from '@domain/metadata-record'
import type {
  GenerationRepository,
  ImageVersion,
  MetadataRecordRepository
} from '@domain/repositories'

/** Stores an image's raw metadata records and the generation merged from them. */
export class ImageMetadataIndex {
  constructor(
    private readonly parser: GenerationSourceParser,
    private readonly merger: GenerationMerger,
    private readonly records: MetadataRecordRepository,
    private readonly generations: GenerationRepository
  ) {}

  /**
   * Replaces the image's records and generation. Returns false, writing nothing, when the
   * image is gone or changed since `version` was read. Call inside a transaction so both
   * writes land together.
   */
  index(version: ImageVersion, records: readonly MetadataRecord[]): boolean {
    if (!this.records.replace(version, records)) return false
    return this.generations.replace(version, this.merger.merge(this.parser.parse(records)))
  }

  /** The records stored for an image, as last indexed. */
  storedRecords(version: ImageVersion): MetadataRecord[] {
    return this.records.list(version.id)
  }

  /** Deletes checkpoints and LoRAs no generation uses any more. */
  pruneUnusedModels(): number {
    return this.generations.pruneUnusedModels()
  }
}
