// Pure and free of zod, so the renderer can show where a download will go.

/** What a model with no base model on Civitai is filed under. */
export const UNKNOWN_BASE_MODEL_FOLDER = 'unknown'

const MAX_FOLDER_NAME = 60

// Families that share an architecture, so what one needs the others can use: the folder is
// for telling a UI which models fit the checkpoint it has loaded.
const FAMILIES: readonly (readonly [RegExp, string])[] = [
  [/^sdxl/, 'sdxl'],
  [/^sd ?1\./, 'sd15'],
  [/^sd ?2\./, 'sd2'],
  [/^sd ?3/, 'sd3'],
  [/^flux\.?1/, 'flux1'],
  [/^flux\.?2/, 'flux2'],
  [/^pony/, 'pony'],
  [/^illustrious/, 'illustrious'],
  [/^noobai/, 'noobai']
]

/**
 * The folder name for a Civitai base model, under the folder chosen for downloads of that kind:
 * `SDXL 1.0`, `SDXL Lightning` and `SDXL Hyper` are all `sdxl`. Any other base model becomes a
 * lowercase name with only letters, digits, dots and dashes; none at all is `unknown`.
 */
export function baseModelFolder(baseModel: string | null | undefined): string {
  const name = (baseModel ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const family = FAMILIES.find(([pattern]) => pattern.test(name))
  if (family) return family[1]
  const slug = name
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, MAX_FOLDER_NAME)
    .replace(/[-.]+$/g, '')
  return slug === '' ? UNKNOWN_BASE_MODEL_FOLDER : slug
}
