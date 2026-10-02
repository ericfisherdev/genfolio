import { describe, expect, it, vi } from 'vitest'
import { electronSecretCipher } from './electron-secret-cipher'

const storage = (
  available: boolean,
  backend?: string
): Parameters<typeof electronSecretCipher>[0] => ({
  isAsyncEncryptionAvailable: vi.fn(async () => available),
  encryptStringAsync: async (text) => Buffer.from(text),
  decryptStringAsync: async (data) => ({ shouldReEncrypt: false, result: data.toString() }),
  ...(backend === undefined ? {} : { getSelectedStorageBackend: () => backend })
})

describe('electronSecretCipher', () => {
  it('is available with a keyring, or where there is no backend to ask about', async () => {
    expect(await electronSecretCipher(storage(true, 'gnome_libsecret')).available()).toBe(true)
    expect(await electronSecretCipher(storage(true, 'kwallet6')).available()).toBe(true)
    expect(await electronSecretCipher(storage(true)).available()).toBe(true)
  })

  it('is not available without encryption, or with the fixed-password fallback', async () => {
    expect(await electronSecretCipher(storage(false, 'gnome_libsecret')).available()).toBe(false)
    const plain = storage(true, 'basic_text')
    expect(await electronSecretCipher(plain).available()).toBe(false)
    expect(plain.isAsyncEncryptionAvailable).not.toHaveBeenCalled()
  })

  it('encrypts and decrypts through the asynchronous calls', async () => {
    const cipher = electronSecretCipher(storage(true))
    expect(await cipher.decrypt(await cipher.encrypt('key'))).toBe('key')
  })
})
