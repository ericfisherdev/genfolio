const INTEGER = /^-?\d+$/
/** Plain decimal notation only: Number() would also take `0x10`, `0b1` and `Infinity`. */
const DECIMAL = /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i

export function parseInteger(text: string | undefined): number | undefined {
  const value = text?.trim()
  if (!value || !INTEGER.test(value)) return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : undefined
}

export function parseDecimal(text: string | undefined): number | undefined {
  const value = text?.trim()
  if (!value || !DECIMAL.test(value)) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

/** `text` unless it is empty or one of the placeholders generators write for "nothing". */
export function presentText(text: string | undefined): string | undefined {
  const value = text?.trim()
  return value && value !== 'None' ? text : undefined
}

/** `T` with every property that may be `undefined` made optional instead. */
type WithoutUndefined<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>
}

/** Drops `undefined` properties so optional fields stay absent (exactOptionalPropertyTypes). */
export function definedFields<T extends object>(fields: T): WithoutUndefined<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as WithoutUndefined<T>
}
