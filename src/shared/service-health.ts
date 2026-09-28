/** Versions and capabilities of the native stack, as observed inside the library service. */
export interface ServiceHealth {
  readonly electron: string
  readonly node: string
  readonly sqlite: string
  readonly fts5: boolean
  /** Formats the image codec decoded successfully in this process. */
  readonly decodableFormats: readonly string[]
}
