import type { SafeStorage } from 'electron'
import type { SecretCipher } from './api-key-store'

type Storage = Pick<SafeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString'> & {
  /** Linux only. */
  getSelectedStorageBackend?: () => string
}

/**
 * Electron's safeStorage as a cipher. On Linux without a keyring it falls back to a fixed
 * password (`basic_text`), which protects nothing, so that counts as no secure place at all.
 */
export const electronSecretCipher = (storage: Storage): SecretCipher => ({
  available: () =>
    storage.isEncryptionAvailable() && storage.getSelectedStorageBackend?.() !== 'basic_text',
  encrypt: (text) => storage.encryptString(text),
  decrypt: (data) => storage.decryptString(data)
})
