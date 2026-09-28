// Runtime enums with no zod dependency, safe for the renderer bundle.

/** Which prompt text a keyword search looks in. */
export enum KeywordScope {
  Positive = 'positive',
  Negative = 'negative',
  Both = 'both'
}

/** Whether an image must match every selected value or any of them. */
export enum SetMatchMode {
  All = 'all',
  Any = 'any'
}
