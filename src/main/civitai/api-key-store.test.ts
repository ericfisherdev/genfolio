import { describe, expect, it, vi } from 'vitest'
import {
  CivitaiApiKeyStore,
  KeyStorageUnavailableError,
  type SecretCipher,
  type SecretFile
} from './api-key-store'

function setup(available = true): {
  store: CivitaiApiKeyStore
  stored: { data?: Buffer }
  cipher: { [M in keyof SecretCipher]: ReturnType<typeof vi.fn> }
} {
  const stored: { data?: Buffer } = {}
  const cipher = {
    available: vi.fn(async () => available),
    encrypt: vi.fn(async (text: string) => Buffer.from(`enc:${text}`)),
    decrypt: vi.fn(async (data: Buffer) => {
      const text = data.toString()
      if (!text.startsWith('enc:')) throw new Error('bad data')
      return text.slice(4)
    })
  }
  const file: SecretFile = {
    read: async () => stored.data,
    write: async (data) => {
      stored.data = data
    },
    remove: async () => {
      delete stored.data
    }
  }
  return { store: new CivitaiApiKeyStore(cipher as SecretCipher, file), stored, cipher }
}

describe('CivitaiApiKeyStore', () => {
  it('keeps the key encrypted and hands it back to main', async () => {
    const { store, stored } = setup()
    await expect(store.status()).resolves.toEqual({ hasKey: false })
    await store.save('abcdef0123456789')
    expect(stored.data?.toString()).toBe('enc:abcdef0123456789')
    expect(stored.data?.toString()).not.toBe('abcdef0123456789')
    await expect(store.key()).resolves.toBe('abcdef0123456789')
    await expect(store.status()).resolves.toEqual({ hasKey: true })
  })

  it('never contacts the keyring to say whether a key is saved, or when there is none', async () => {
    const { store, cipher } = setup()
    await store.status()
    await expect(store.key()).resolves.toBeUndefined()
    expect(cipher.available).not.toHaveBeenCalled()
    expect(cipher.decrypt).not.toHaveBeenCalled()
  })

  it('forgets the key', async () => {
    const { store } = setup()
    await store.save('abcdef0123456789')
    await store.clear()
    await store.clear()
    await expect(store.key()).resolves.toBeUndefined()
    await expect(store.status()).resolves.toEqual({ hasKey: false })
  })

  it('refuses to keep a key without a secure place', async () => {
    const { store, stored } = setup(false)
    await expect(store.save('abcdef0123456789')).rejects.toBeInstanceOf(KeyStorageUnavailableError)
    expect(stored.data).toBeUndefined()
    await expect(store.status()).resolves.toEqual({ hasKey: false })
  })

  it('writes nothing when encrypting is refused', async () => {
    const { store, stored, cipher } = setup()
    cipher.encrypt.mockRejectedValue(new KeyStorageUnavailableError())
    await expect(store.save('abcdef0123456789')).rejects.toBeInstanceOf(KeyStorageUnavailableError)
    expect(stored.data).toBeUndefined()
    await expect(store.status()).resolves.toEqual({ hasKey: false })
  })

  it('does not use a stored key it can no longer read or that the keyring now refuses', async () => {
    const { store, stored } = setup()
    stored.data = Buffer.from('garbage')
    await expect(store.key()).resolves.toBeUndefined()
    const none = setup(false)
    none.stored.data = Buffer.from('enc:abcdef0123456789')
    await expect(none.store.key()).resolves.toBeUndefined()
    await expect(none.store.status()).resolves.toEqual({ hasKey: true })
  })
})
