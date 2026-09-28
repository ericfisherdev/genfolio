import type { z } from 'zod'

/** One-line summary of a zod failure, e.g. `node: Invalid input; decodableFormats.0: …`. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ')
}
