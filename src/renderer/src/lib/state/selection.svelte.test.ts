import { describe, expect, it } from 'vitest'
import { SelectionState, type DisplayOrder } from './selection.svelte'

/** Display order over fixed ids, as the gallery would list them. */
function orderOf(ids: number[]): DisplayOrder {
  return {
    get count() {
      return ids.length
    },
    indexOf: (imageId) => ids.indexOf(imageId),
    idAt: (index) => ids[index] ?? -1
  }
}

describe('SelectionState', () => {
  it('toggles an image in and out', () => {
    const selection = new SelectionState(orderOf([10, 20, 30]))
    selection.toggle(20)
    expect(selection.has(20)).toBe(true)
    expect(selection.count).toBe(1)
    selection.toggle(20)
    expect(selection.has(20)).toBe(false)
    expect(selection.count).toBe(0)
  })

  it('extends from the last toggled image in either direction', () => {
    const selection = new SelectionState(orderOf([10, 20, 30, 40, 50]))
    selection.toggle(40)
    selection.extendTo(20)
    expect(selection.list()).toEqual([20, 30, 40])
    selection.toggle(10)
    selection.extendTo(30)
    expect(selection.list()).toEqual([10, 20, 30, 40])
  })

  it('toggles when there is no anchor to extend from', () => {
    const selection = new SelectionState(orderOf([10, 20, 30]))
    selection.extendTo(30)
    expect(selection.list()).toEqual([30])
  })

  it('toggles when the anchor left the view', () => {
    const ids = [10, 20, 30]
    const selection = new SelectionState(orderOf(ids))
    selection.toggle(10)
    ids.splice(0, 1)
    selection.extendTo(30)
    expect(selection.list()).toEqual([30])
  })

  it('selects every image in the view, and clearing also drops the anchor', () => {
    const selection = new SelectionState(orderOf([10, 20, 30]))
    selection.toggle(20)
    selection.selectAll()
    expect(selection.count).toBe(3)
    selection.clear()
    expect(selection.count).toBe(0)
    selection.extendTo(30)
    expect(selection.list()).toEqual([30])
  })

  it('lists the selection in display order and leaves out images no longer shown', () => {
    const ids = [10, 20, 30]
    const selection = new SelectionState(orderOf(ids))
    selection.toggle(30)
    selection.toggle(10)
    selection.toggle(20)
    expect(selection.list()).toEqual([10, 20, 30])
    ids.splice(1, 1)
    expect(selection.list()).toEqual([10, 30])
  })
})
