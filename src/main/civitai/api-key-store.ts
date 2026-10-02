import type { CivitaiKeyStatus } from '@shared/civitai-key'

/**
 * Encrypts with what the operating system keeps for the user (a keyring on Linux). Every call
 * is asynchronous: a keyring that is slow or not answering (a locked or absent KWallet can take
 * 25 s) must never hold up the app.
 */
export interface SecretCipher {
  /** Whether a secure place for the key exists; with none, a key is not stored. */
  available(): Promise<boolean>
  encrypt(text: string): Promise<Buffer>
  decrypt(data: Buffer): Promise<string>
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
    super(
      'No system keyring is available to keep the key safely (such as GNOME Keyring or KWallet).'
    )
    this.name = 'KeyStorageUnavailableError'
  }
}

/**
 * The user's Civitai API key, encrypted at rest and handed only to main's downloads: the
 * renderer can learn whether there is one, never what it is. The keyring is contacted only
 * when a key is saved or read back, never to answer whether one exists.
 */
export class CivitaiApiKeyStore {
  constructor(
    private readonly cipher: SecretCipher,
    private readonly file: SecretFile
  ) {}

  async status(): Promise<CivitaiKeyStatus> {
    return { hasKey: (await this.file.read()) !== undefined }
  }

  /** The key, or undefined when none is saved or it can no longer be decrypted. */
  async key(): Promise<string | undefined> {
    const data = await this.file.read()
    if (!data || !(await this.cipher.available())) return undefined
    try {
      return (await this.cipher.decrypt(data)) || undefined
    } catch {
      return undefined
    }
  }

  /** @throws KeyStorageUnavailableError when there is no secure place to keep it */
  async save(key: string): Promise<void> {
    if (!(await this.cipher.available())) throw new KeyStorageUnavailableError()
    await this.file.write(await this.cipher.encrypt(key))
  }

  async clear(): Promise<void> {
    await this.file.remove()
  }
}
