import { describe, expect, it } from 'vitest'
import { electronSecretCipher } from './electron-secret-cipher'

const storage = (
  available: boolean,
  backend?: string
): Parameters<typeof electronSecretCipher>[0] => ({
  isEncryptionAvailable: () => available,
  encryptString: (text) => Buffer.from(text),
  decryptString: (data) => data.toString(),
  ...(backend === undefined ? {} : { getSelectedStorageBackend: () => backend })
})

describe('electronSecretCipher', () => {
  it('is available with a keyring, or where there is no backend to ask about', () => {
    expect(electronSecretCipher(storage(true, 'gnome_libsecret')).available()).toBe(true)
    expect(electronSecretCipher(storage(true, 'kwallet6')).available()).toBe(true)
    expect(electronSecretCipher(storage(true)).available()).toBe(true)
  })

  it('is not available without encryption, or with the fixed-password fallback', () => {
    expect(electronSecretCipher(storage(false, 'gnome_libsecret')).available()).toBe(false)
    expect(electronSecretCipher(storage(true, 'basic_text')).available()).toBe(false)
  })

  it('encrypts and decrypts through the storage', () => {
    const cipher = electronSecretCipher(storage(true))
    expect(cipher.decrypt(cipher.encrypt('key'))).toBe('key')
  })
})
