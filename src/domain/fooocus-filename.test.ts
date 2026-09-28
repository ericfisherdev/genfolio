import { describe, expect, it } from 'vitest'
import { parseFooocusTimestamp } from './fooocus-filename'

describe('parseFooocusTimestamp', () => {
  it('reads the local time from a Fooocus output name', () => {
    expect(parseFooocusTimestamp('2026-09-27_14-03-11_1234.png')).toBe(
      new Date(2026, 8, 27, 14, 3, 11).getTime()
    )
  })

  it.each([
    'photo.png',
    '2026-09-27_14-03-11.png',
    '2026-13-01_00-00-00_1.png',
    '2026-02-30_00-00-00_1.png',
    '2026-09-27_24-00-00_1.png',
    'x2026-09-27_14-03-11_1234.png'
  ])('returns undefined for %s', (name) => {
    expect(parseFooocusTimestamp(name)).toBeUndefined()
  })
})
