import { GeneratorKind, ResourceKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'

const GENERATOR_LABELS: Readonly<Record<GeneratorKind, string>> = {
  [GeneratorKind.A1111]: 'A1111',
  [GeneratorKind.Fooocus]: 'Fooocus',
  [GeneratorKind.FwdFooocus]: 'FwdFooocus',
  [GeneratorKind.UnFooocused]: 'UnFooocused',
  [GeneratorKind.Unknown]: 'Unknown'
}

export const generatorLabel = (kind: GeneratorKind): string => GENERATOR_LABELS[kind]

/** Where the data came from, as the badge says it: inside the file, the log, or a sidecar. */
export function originLabel(origin: MetadataOrigin): string {
  if (origin === MetadataOrigin.FooocusLog) return 'Log'
  if (origin === MetadataOrigin.SidecarTxt) return 'Sidecar'
  return 'Embedded'
}

const ORIGIN_DESCRIPTIONS: Readonly<Record<MetadataOrigin, string>> = {
  [MetadataOrigin.PngText]: 'PNG text chunk',
  [MetadataOrigin.ExifUserComment]: 'EXIF UserComment',
  [MetadataOrigin.ExifImageDescription]: 'EXIF ImageDescription',
  [MetadataOrigin.ExifSoftware]: 'EXIF Software',
  [MetadataOrigin.ExifMakerNote]: 'EXIF MakerNote',
  [MetadataOrigin.SidecarTxt]: 'Sidecar .txt file',
  [MetadataOrigin.FooocusLog]: 'Fooocus log.html'
}

/** The record's exact place, for the Sources list and weight tooltips. */
export const originDescription = (origin: MetadataOrigin): string => ORIGIN_DESCRIPTIONS[origin]

const RESOURCE_LABELS: Readonly<Record<ResourceKind, string>> = {
  [ResourceKind.Checkpoint]: 'Checkpoint',
  [ResourceKind.Refiner]: 'Refiner',
  [ResourceKind.Lora]: 'LoRA'
}

export const resourceKindLabel = (kind: ResourceKind): string => RESOURCE_LABELS[kind]

/** Hashes are shown by their first 10 digits, as Civitai does. */
export const shortHash = (hash: string): string => hash.slice(0, 10)
