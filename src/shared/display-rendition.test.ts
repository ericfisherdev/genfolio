import { describe, expect, it } from 'vitest'
import {
  gridRenditionWidth,
  ImageDisplay,
  imageUrl,
  isGridRenditionWidth,
  usesGridCopy
} from './display-rendition'

describe('gridRenditionWidth', () => {
  it('picks the smallest width that covers the card at the pixel ratio, capped at the largest', () => {
    expect(gridRenditionWidth(320, 1)).toBe(400)
    expect(gridRenditionWidth(400, 1)).toBe(400)
    expect(gridRenditionWidth(320, 1.5)).toBe(600)
    expect(gridRenditionWidth(320, 2)).toBe(800)
    expect(gridRenditionWidth(600, 2)).toBe(800)
  })
})

describe('usesGridCopy', () => {
  it('copies only images wider than the rendition, never upscaling', () => {
    expect(usesGridCopy(400, 400)).toBe(false)
    expect(usesGridCopy(300, 400)).toBe(false)
    expect(usesGridCopy(401, 400)).toBe(true)
    expect(usesGridCopy(1024, 400)).toBe(true)
  })
})

describe('isGridRenditionWidth', () => {
  it('accepts only the fixed widths', () => {
    expect(isGridRenditionWidth(400)).toBe(true)
    expect(isGridRenditionWidth(800)).toBe(true)
    expect(isGridRenditionWidth(500)).toBe(false)
  })
})

describe('imageUrl', () => {
  it('builds id-only URLs with the display and width as query parameters', () => {
    expect(imageUrl(42, ImageDisplay.Original)).toBe('genfolio://img/42')
    expect(imageUrl(42, ImageDisplay.Grid)).toBe('genfolio://img/42?display=grid&w=400')
    expect(imageUrl(42, ImageDisplay.Grid, 800)).toBe('genfolio://img/42?display=grid&w=800')
  })
})
