import { describe, expect, it } from 'vitest'
import { ImageDisplay, imageUrl, LARGE_IMAGE_PIXELS, usesGridCopy } from './display-rendition'

describe('usesGridCopy', () => {
  it('keeps originals up to the pixel limit and copies anything larger', () => {
    expect(usesGridCopy(2000, LARGE_IMAGE_PIXELS / 2000)).toBe(false)
    expect(usesGridCopy(1024, 1024)).toBe(false)
    expect(usesGridCopy(2001, 2000)).toBe(true)
    expect(usesGridCopy(4096, 4096)).toBe(true)
  })
})

describe('imageUrl', () => {
  it('builds id-only URLs', () => {
    expect(imageUrl(42, ImageDisplay.Original)).toBe('genfolio://img/42')
    expect(imageUrl(42, ImageDisplay.Grid)).toBe('genfolio://img/42?display=grid')
  })
})
