import type { SafeStorage } from 'electron'
import { KeyStorageUnavailableError, type SecretCipher } from './api-key-store'

type Storage = Pick<
  SafeStorage,
  'isAsyncEncryptionAvailable' | 'encryptStringAsync' | 'decryptStringAsync'
> & {
  /** Linux only. */
  getSelectedStorageBackend?: () => string
}

/**
 * Chromium tags data made with its fixed fallback password `v10`; a key from a keyring is `v11`.
 * On Linux, when the keyring (KWallet, libsecret) doesn't answer, encrypting still succeeds, with
 * that fixed password, which protects nothing. (On Windows and macOS `v10` is a real key.)
 */
const FIXED_KEY_TAG = 'v10'

const usesFixedKey = (storage: Storage, data: Buffer): boolean =>
  storage.getSelectedStorageBackend !== undefined &&
  data.subarray(0, FIXED_KEY_TAG.length).toString() === FIXED_KEY_TAG

/**
 * Electron's safeStorage as a cipher, through its asynchronous calls only: the synchronous ones
 * block the main process while the keyring answers, and a KWallet that isn't running makes
 * that 25 s to 50 s of a frozen app.
 *
 * `available()` cannot tell a keyring that answered from the fixed-password fallback (the async
 * check is true either way), so that is caught where it shows: `encrypt` refuses data made with
 * the fixed password, and `decrypt` refuses to read it. Linux's `basic_text` backend is the same
 * fallback chosen outright, and is refused up front.
 */
export const electronSecretCipher = (storage: Storage): SecretCipher => ({
  available: async () =>
    storage.getSelectedStorageBackend?.() !== 'basic_text' &&
    (await storage.isAsyncEncryptionAvailable()),
  encrypt: async (text) => {
    const data = await storage.encryptStringAsync(text)
    if (usesFixedKey(storage, data)) throw new KeyStorageUnavailableError()
    return data
  },
  decrypt: async (data) => {
    if (usesFixedKey(storage, data)) throw new KeyStorageUnavailableError()
    return (await storage.decryptStringAsync(data)).result
  }
})
