import { describe, expect, it } from 'vitest'
import { Playlist } from './playlist'

const IDS = [1, 2, 3, 4, 5, 6, 7, 8]

function take(playlist: Playlist, count: number): (number | undefined)[] {
  const seen = [playlist.current]
  for (let step = 1; step < count; step++) seen.push(playlist.next())
  return seen
}

describe('Playlist', () => {
  it('plays in order from the start image and stops at the end without loop', () => {
    const playlist = new Playlist([1, 2, 3], { startId: 2, shuffle: false, loop: false, seed: 1 })
    expect(take(playlist, 3)).toEqual([2, 3, 3])
    expect(playlist.atEnd).toBe(true)
    expect(playlist.previous()).toBe(2)
  })

  it('wraps around in order when looping', () => {
    const playlist = new Playlist([1, 2, 3], { startId: 2, shuffle: false, loop: true, seed: 1 })
    expect(take(playlist, 7)).toEqual([2, 3, 1, 2, 3, 1, 2])
    expect(playlist.atEnd).toBe(false)
  })

  it('shuffles with a seed, showing every image once before any repeats', () => {
    const options = { startId: 3, shuffle: true, loop: true, seed: 42 }
    const first = take(new Playlist(IDS, options), IDS.length * 3)
    expect(first).toEqual(take(new Playlist(IDS, options), IDS.length * 3))
    expect(first[0]).toBe(3)
    for (let round = 0; round < 3; round++) {
      const shown = first.slice(round * IDS.length, (round + 1) * IDS.length)
      expect([...shown].sort()).toEqual(IDS)
    }
    // No image shows twice in a row across rounds.
    expect(first.some((id, index) => index > 0 && id === first[index - 1])).toBe(false)
    expect(first).not.toEqual(take(new Playlist(IDS, { ...options, seed: 43 }), IDS.length * 3))
  })

  it('starts at the first image when the start is unknown, and is empty with no ids', () => {
    expect(new Playlist([5, 6], { startId: 9, shuffle: false, loop: false, seed: 1 }).current).toBe(
      5
    )
    const empty = new Playlist([], { shuffle: true, loop: true, seed: 1 })
    expect(empty.current).toBeUndefined()
    expect(empty.next()).toBeUndefined()
  })
})
