import type { CivitaiKeyStatus } from '@shared/civitai-key'

/** Encrypts with what the operating system keeps for the user (a keyring on Linux). */
export interface SecretCipher {
  /** Whether a secure place for the key exists; with none, a key is not stored. */
  available(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

/** Where the encrypted key lives. */
export interface SecretFile {
  read(): Promise<Buffer | undefined>
  write(data: Buffer): Promise<void>
  remove(): Promise<void>
}

/** Thrown when the key can't be kept safely on this computer. */
export class KeyStorageUnavailableError extends Error {
  constructor() {
    super('No system keyring is available to keep the key safely.')
    this.name = 'KeyStorageUnavailableError'
  }
}

/**
 * The user's Civitai API key, encrypted at rest and handed only to main's downloads: the
 * renderer can learn whether there is one, never what it is.
 */
export class CivitaiApiKeyStore {
  constructor(
    private readonly cipher: SecretCipher,
    private readonly file: SecretFile
  ) {}

  async status(): Promise<CivitaiKeyStatus> {
    return { hasKey: (await this.key()) !== undefined, canStore: this.cipher.available() }
  }

  /** The key, or undefined when none is saved or it can no longer be decrypted. */
  async key(): Promise<string | undefined> {
    if (!this.cipher.available()) return undefined
    const data = await this.file.read()
    if (!data) return undefined
    try {
      return this.cipher.decrypt(data) || undefined
    } catch {
      return undefined
    }
  }

  /** @throws KeyStorageUnavailableError when there is no secure place to keep it */
  async save(key: string): Promise<void> {
    if (!this.cipher.available()) throw new KeyStorageUnavailableError()
    await this.file.write(this.cipher.encrypt(key))
  }

  async clear(): Promise<void> {
    await this.file.remove()
  }
}
