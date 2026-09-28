import type { GenerationParser, SourcedGeneration } from '@domain/generation'
import type { MetadataRecord } from '@domain/metadata-record'
import { MetadataOrigin } from '@shared/metadata-kinds'

/** Records that can hold a whole generation; Software, MakerNote and the like are only hints. */
function carriesGeneration(record: MetadataRecord): boolean {
  switch (record.origin) {
    case MetadataOrigin.PngText:
      return record.key === 'parameters'
    case MetadataOrigin.ExifUserComment:
    case MetadataOrigin.ExifImageDescription:
    case MetadataOrigin.SidecarTxt:
      return true
    default:
      return false
  }
}

/** Runs each generation-carrying record through the first parser that understands it. */
export class GenerationRecordParser {
  /** `parsers` are tried in order, so put the most specific formats first. */
  constructor(private readonly parsers: readonly GenerationParser[]) {}

  parse(records: readonly MetadataRecord[]): SourcedGeneration[] {
    return records.filter(carriesGeneration).flatMap((record) => {
      const generation = this.firstParse(record.value)
      return generation ? [{ origin: record.origin, generation }] : []
    })
  }

  private firstParse(text: string): SourcedGeneration['generation'] | undefined {
    for (const parser of this.parsers) {
      const generation = parser.parse(text)
      if (generation) return generation
    }
    return undefined
  }
}
