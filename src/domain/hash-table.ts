import type { StoredHashes } from './repositories'
import { popcount32, splitHash, type SimilarPair } from './similarity'

/**
 * Every hashed image's dHash and pHash in typed arrays (32-bit halves), so one image is
 * compared with all others in a tight loop. A pair's distance is the larger of the two
 * Hamming distances; files with the same SHA-256 are distance 0.
 */
export class HashTable {
  private readonly ids: Int32Array
  private readonly dHi: Uint32Array
  private readonly dLo: Uint32Array
  private readonly pHi: Uint32Array
  private readonly pLo: Uint32Array
  private readonly sha: (string | undefined)[]
  private readonly indexOf = new Map<number, number>()

  constructor(hashes: readonly StoredHashes[]) {
    const size = hashes.length
    this.ids = new Int32Array(size)
    this.dHi = new Uint32Array(size)
    this.dLo = new Uint32Array(size)
    this.pHi = new Uint32Array(size)
    this.pLo = new Uint32Array(size)
    this.sha = new Array<string | undefined>(size)
    hashes.forEach((image, index) => {
      const d = splitHash(image.dhash)
      const p = splitHash(image.phash)
      this.ids[index] = image.id
      this.dHi[index] = d.hi
      this.dLo[index] = d.lo
      this.pHi[index] = p.hi
      this.pLo[index] = p.lo
      this.sha[index] = image.sha256 ? Buffer.from(image.sha256).toString('hex') : undefined
      this.indexOf.set(image.id, index)
    })
  }

  has(imageId: number): boolean {
    return this.indexOf.has(imageId)
  }

  /**
   * Pairs of `imageId` with every other image within `max` bits. `skip` leaves out partners
   * already compared from their own side (when several new images are compared).
   */
  pairsOf(imageId: number, max: number, skip: (other: number) => boolean): SimilarPair[] {
    const at = this.indexOf.get(imageId)
    if (at === undefined) return []
    const [dHi, dLo, pHi, pLo] = [
      this.dHi[at] ?? 0,
      this.dLo[at] ?? 0,
      this.pHi[at] ?? 0,
      this.pLo[at] ?? 0
    ]
    const sha = this.sha[at]
    const pairs: SimilarPair[] = []
    // Local references and unchecked reads: this loop runs once per hashed image.
    const { ids, dHi: dHis, dLo: dLos, pHi: pHis, pLo: pLos } = this
    for (let index = 0; index < ids.length; index++) {
      if (index === at) continue
      const d =
        popcount32((dHis[index] as number) ^ dHi) + popcount32((dLos[index] as number) ^ dLo)
      if (d > max) continue
      const p =
        popcount32((pHis[index] as number) ^ pHi) + popcount32((pLos[index] as number) ^ pLo)
      if (p > max) continue
      const other = ids[index] as number
      if (skip(other)) continue
      const distance = sha !== undefined && sha === this.sha[index] ? 0 : Math.max(d, p)
      pairs.push(
        imageId < other ? { a: imageId, b: other, distance } : { a: other, b: imageId, distance }
      )
    }
    return pairs
  }
}
