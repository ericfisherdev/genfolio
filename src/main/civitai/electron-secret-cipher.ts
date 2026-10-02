import type { SafeStorage } from 'electron'
import type { SecretCipher } from './api-key-store'

type Storage = Pick<
  SafeStorage,
  'isAsyncEncryptionAvailable' | 'encryptStringAsync' | 'decryptStringAsync'
> & {
  /** Linux only. */
  getSelectedStorageBackend?: () => string
}

/**
 * Electron's safeStorage as a cipher, through its asynchronous calls only: the synchronous ones
 * block the main process while the keyring answers, and a KWallet that isn't running makes
 * that 25 s to 50 s of a frozen app. On Linux without a keyring it falls back to a fixed
 * password (`basic_text`), which protects nothing, so that counts as no secure place at all.
 */
export const electronSecretCipher = (storage: Storage): SecretCipher => ({
  available: async () =>
    storage.getSelectedStorageBackend?.() !== 'basic_text' &&
    (await storage.isAsyncEncryptionAvailable()),
  encrypt: (text) => storage.encryptStringAsync(text),
  decrypt: async (data) => (await storage.decryptStringAsync(data)).result
})
