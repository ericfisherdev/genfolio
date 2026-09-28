/**
 * Perceptual hashes over greyscale pixels (8-bit luma, row-major). Both are 64-bit and
 * compared by Hamming distance: resizing or re-encoding moves few bits, other pictures ~32.
 */

/** Bump when the hashing changes, so every image is hashed again. */
export const HASH_VERSION = 1

/** Pixels the hashes are computed from: a 64×64 greyscale thumbnail. */
export const HASH_SOURCE_SIZE = 64

/**
 * dHash: the image area-averaged to 9×8; bit (y, x) says whether a pixel is brighter than its
 * right neighbour. Rows go most significant first.
 */
export function dHash(luma: Uint8Array, size = HASH_SOURCE_SIZE): bigint {
  const small = areaResample(luma, size, size, 9, 8)
  let hash = 0n
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const bit = (small[y * 9 + x] ?? 0) > (small[y * 9 + x + 1] ?? 0) ? 1n : 0n
      hash = (hash << 1n) | bit
    }
  }
  return hash
}

const DCT_SIZE = 32
const LOW = 8
/** cos((2x + 1) u π / 2N) for the first LOW frequencies u, every sample x. */
const COSINES = Array.from({ length: LOW }, (_, u) =>
  Float64Array.from({ length: DCT_SIZE }, (_, x) =>
    Math.cos(((2 * x + 1) * u * Math.PI) / (2 * DCT_SIZE))
  )
)

/**
 * pHash: the image area-averaged to 32×32, its 2-D DCT-II, and the 8×8 lowest frequencies;
 * a bit is set where the coefficient is above their median (as the imagehash library does).
 */
export function pHash(luma: Uint8Array, size = HASH_SOURCE_SIZE): bigint {
  const pixels = areaResample(luma, size, size, DCT_SIZE, DCT_SIZE)
  // Separable: the low frequencies of every row, then of every column of those.
  const rows = new Float64Array(DCT_SIZE * LOW)
  for (let y = 0; y < DCT_SIZE; y++) {
    for (let u = 0; u < LOW; u++) {
      const cos = COSINES[u] as Float64Array
      let sum = 0
      for (let x = 0; x < DCT_SIZE; x++) sum += (pixels[y * DCT_SIZE + x] ?? 0) * (cos[x] ?? 0)
      rows[y * LOW + u] = sum
    }
  }
  const coefficients = new Float64Array(LOW * LOW)
  for (let v = 0; v < LOW; v++) {
    const cos = COSINES[v] as Float64Array
    for (let u = 0; u < LOW; u++) {
      let sum = 0
      for (let y = 0; y < DCT_SIZE; y++) sum += (rows[y * LOW + u] ?? 0) * (cos[y] ?? 0)
      coefficients[v * LOW + u] = sum
    }
  }
  const median = medianOf(coefficients)
  let hash = 0n
  for (const coefficient of coefficients) hash = (hash << 1n) | (coefficient > median ? 1n : 0n)
  return hash
}

/** Bits that differ between two 64-bit hashes. */
export function hamming(a: bigint, b: bigint): number {
  let diff = BigInt.asUintN(64, a ^ b)
  let count = 0
  while (diff) {
    diff &= diff - 1n
    count++
  }
  return count
}

/** Averages each target cell over the source pixels it covers (fractional edges weighted). */
function areaResample(
  source: Uint8Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number
): Float64Array {
  const target = new Float64Array(targetWidth * targetHeight)
  const scaleX = width / targetWidth
  const scaleY = height / targetHeight
  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = ty * scaleY
    const y1 = y0 + scaleY
    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = tx * scaleX
      const x1 = x0 + scaleX
      let sum = 0
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0)
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0)
          sum += (source[y * width + x] ?? 0) * wx * wy
        }
      }
      target[ty * targetWidth + tx] = sum / (scaleX * scaleY)
    }
  }
  return target
}

function medianOf(values: Float64Array): number {
  const sorted = Float64Array.from(values).sort()
  const middle = sorted.length / 2
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}
