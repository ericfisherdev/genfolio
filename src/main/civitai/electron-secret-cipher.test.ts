import { describe, expect, it, vi } from 'vitest'
import { KeyStorageUnavailableError } from './api-key-store'
import { electronSecretCipher } from './electron-secret-cipher'

const storage = (
  available: boolean,
  backend?: string,
  tag = 'v11'
): Parameters<typeof electronSecretCipher>[0] => ({
  isAsyncEncryptionAvailable: vi.fn(async () => available),
  encryptStringAsync: async (text) => Buffer.from(`${tag}${text}`),
  decryptStringAsync: async (data) => ({
    shouldReEncrypt: false,
    result: data.subarray(3).toString()
  }),
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

  it('refuses to encrypt with the fixed password Chromium falls back to when a Linux keyring does not answer', async () => {
    const cipher = electronSecretCipher(storage(true, 'kwallet6', 'v10'))
    expect(await cipher.available()).toBe(true)
    await expect(cipher.encrypt('key')).rejects.toBeInstanceOf(KeyStorageUnavailableError)
  })

  it('refuses to read data made with the fixed password, and reads keyring data', async () => {
    const cipher = electronSecretCipher(storage(true, 'gnome_libsecret'))
    await expect(cipher.decrypt(Buffer.from('v10secret'))).rejects.toBeInstanceOf(
      KeyStorageUnavailableError
    )
    await expect(cipher.decrypt(Buffer.from('v11secret'))).resolves.toBe('secret')
  })

  it('accepts v10 where there is no Linux backend to ask about (Windows and macOS keys)', async () => {
    const cipher = electronSecretCipher(storage(true, undefined, 'v10'))
    const data = await cipher.encrypt('key')
    expect(await cipher.decrypt(data)).toBe('key')
  })
})
