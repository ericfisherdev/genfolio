import { SvelteSet } from 'svelte/reactivity'

/** Positions in the gallery's display order, so a range covers cards that aren't mounted. */
export interface DisplayOrder {
  readonly count: number
  indexOf(imageId: number): number
  idAt(index: number): number
}

/**
 * The images selected in the gallery. Ctrl/Cmd-click toggles one and moves the anchor;
 * Shift-click adds the range from the anchor in display order.
 */
export class SelectionState {
  readonly ids = new SvelteSet<number>()
  readonly count = $derived(this.ids.size)
  private anchor: number | undefined

  constructor(private readonly order: DisplayOrder) {}

  has(imageId: number): boolean {
    return this.ids.has(imageId)
  }

  toggle(imageId: number): void {
    if (this.ids.has(imageId)) this.ids.delete(imageId)
    else this.ids.add(imageId)
    this.anchor = imageId
  }

  /** Adds everything between the anchor and `imageId`; without an anchor, toggles. */
  extendTo(imageId: number): void {
    const from = this.anchor === undefined ? -1 : this.order.indexOf(this.anchor)
    const to = this.order.indexOf(imageId)
    if (from < 0 || to < 0) {
      this.toggle(imageId)
      return
    }
    for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
      this.ids.add(this.order.idAt(index))
    }
  }

  selectAll(): void {
    for (let index = 0; index < this.order.count; index++) this.ids.add(this.order.idAt(index))
  }

  clear(): void {
    this.ids.clear()
    this.anchor = undefined
  }

  /** The selection in display order. */
  list(): number[] {
    const selected: number[] = []
    for (let index = 0; index < this.order.count; index++) {
      const id = this.order.idAt(index)
      if (this.ids.has(id)) selected.push(id)
    }
    return selected
  }
}
