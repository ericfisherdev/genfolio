import { packagedExecutable } from './launch'

/**
 * The electron package downloads its binary lazily on first require. Doing that here, once,
 * stops parallel workers from extracting it concurrently, where one would exec the binary
 * while another is still writing it (spawn ETXTBSY).
 */
export default async function globalSetup(): Promise<void> {
  if (!packagedExecutable) await import('electron')
}
