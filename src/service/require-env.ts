/** Reads a variable the parent process must set; throws when it is missing or empty. */
export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name]
  if (value === undefined || value === '') {
    throw new Error(`Environment variable ${name} is required`)
  }
  return value
}
