/** Something the user named and can pick by name, with how many images it holds. */
export interface NamedItem {
  readonly id: number
  readonly name: string
  readonly imageCount: number
}
