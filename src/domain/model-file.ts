import type { CivitaiFile, CivitaiVersion } from './civitai'

/** The extensions of the files that are models; anything else on a Civitai version is not. */
export const MODEL_FILE_EXTENSIONS: readonly string[] = [
  '.safetensors',
  '.ckpt',
  '.pt',
  '.pth',
  '.bin'
]

const MAX_FILE_NAME = 200
// Anything that is a path separator or control character somewhere, or can't be in a file name.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g

/**
 * A name safe to write as a file in a folder: the last path part only, no characters a file
 * system refuses, no leading dots, at most 200 characters with the extension kept. Null when
 * nothing usable is left or the extension is not a model file's.
 */
export function safeModelFileName(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(UNSAFE_CHARACTERS, '_').trim().replace(/^\.+/, '').trim()
  const dot = cleaned.lastIndexOf('.')
  const extension = dot < 0 ? '' : cleaned.slice(dot).toLowerCase()
  if (!MODEL_FILE_EXTENSIONS.includes(extension)) return null
  const stem = cleaned.slice(0, dot).trim()
  if (stem === '') return null
  return `${stem.slice(0, MAX_FILE_NAME - extension.length).trim()}${extension}`
}

/**
 * The file to download for a version: its primary model file, else the first model file. Null
 * when it has none (or none with a usable name).
 */
export function modelFileOf(version: CivitaiVersion): CivitaiFile | null {
  const usable = version.files.filter(
    (file) => (file.type === null || file.type === 'Model') && safeModelFileName(file.name) !== null
  )
  return usable.find((file) => file.primary) ?? usable[0] ?? null
}
