import { describe, expect, it } from 'vitest'
import { AddRootOutcome } from '@shared/library-kinds'
import { ScanPhase } from '@shared/scan-kinds'
import { addRootMessage } from './add-root-message'
import { scanProgressText } from './scan-progress-text'

const root = { id: 1, path: '/lib', addedAt: 0, imageCount: 0, scanning: true }

describe('addRootMessage', () => {
  it('stays quiet for a plain add and a cancelled picker', () => {
    expect(
      addRootMessage({ outcome: AddRootOutcome.Added, root, absorbedRoots: 0 })
    ).toBeUndefined()
    expect(addRootMessage({ outcome: AddRootOutcome.Cancelled })).toBeUndefined()
  })

  it('explains merges and every rejection', () => {
    expect(addRootMessage({ outcome: AddRootOutcome.Added, root, absorbedRoots: 2 })).toBe(
      'Added /lib and merged 2 folders already in the library.'
    )
    expect(addRootMessage({ outcome: AddRootOutcome.AlreadyAdded, path: '/lib' })).toBe(
      '/lib is already in the library.'
    )
    expect(addRootMessage({ outcome: AddRootOutcome.InsideExistingRoot, path: '/lib' })).toBe(
      'That folder is already included in /lib.'
    )
    expect(addRootMessage({ outcome: AddRootOutcome.NotADirectory, path: '/x' })).toBe(
      '/x is not a folder that can be added.'
    )
  })
})

describe('scanProgressText', () => {
  it('describes each phase', () => {
    expect(scanProgressText({ phase: ScanPhase.Walking, done: 1500, total: null })).toBe(
      'Finding images… 1,500'
    )
    expect(scanProgressText({ phase: ScanPhase.Indexing, done: 120, total: 4500 })).toBe(
      'Indexing 120 / 4,500'
    )
    expect(scanProgressText({ phase: ScanPhase.Pruning, done: 0, total: null })).toBe('Tidying up…')
  })
})
