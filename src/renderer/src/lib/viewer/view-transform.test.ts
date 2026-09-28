import { describe, expect, it } from 'vitest'
import { centered, fitScale, MAX_SCALE, panBy, wheelFactor, zoomAt } from './view-transform'

describe('view transform', () => {
  it('fits large images and never enlarges small ones', () => {
    expect(fitScale({ width: 2000, height: 1000 }, { width: 1000, height: 1000 })).toBe(0.5)
    expect(fitScale({ width: 400, height: 300 }, { width: 1000, height: 1000 })).toBe(1)
  })

  it('centres the image', () => {
    expect(centered({ width: 400, height: 200 }, { width: 1000, height: 800 }, 1)).toEqual({
      scale: 1,
      x: 300,
      y: 300
    })
  })

  it('keeps the image point under the cursor fixed while zooming', () => {
    const before = { scale: 1, x: 100, y: 50 }
    const cursor = { x: 300, y: 250 }
    const imagePoint = {
      x: (cursor.x - before.x) / before.scale,
      y: (cursor.y - before.y) / before.scale
    }
    const after = zoomAt(before, 2.5, cursor)
    expect(after.x + imagePoint.x * after.scale).toBeCloseTo(cursor.x)
    expect(after.y + imagePoint.y * after.scale).toBeCloseTo(cursor.y)
  })

  it('clamps the zoom level', () => {
    expect(zoomAt({ scale: 4, x: 0, y: 0 }, 10, { x: 0, y: 0 }).scale).toBe(MAX_SCALE)
  })

  it('pans and maps wheel deltas to zoom factors', () => {
    expect(panBy({ scale: 1, x: 10, y: 10 }, 5, -3)).toEqual({ scale: 1, x: 15, y: 7 })
    expect(wheelFactor(-100)).toBeGreaterThan(1)
    expect(wheelFactor(100)).toBeLessThan(1)
    expect(wheelFactor(100) * wheelFactor(-100)).toBeCloseTo(1)
  })
})
