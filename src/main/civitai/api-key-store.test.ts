import { describe, expect, it } from 'vitest'
import {
  CivitaiApiKeyStore,
  KeyStorageUnavailableError,
  type SecretCipher,
  type SecretFile
} from './api-key-store'

function setup(available = true): { store: CivitaiApiKeyStore; stored: { data?: Buffer } } {
  const stored: { data?: Buffer } = {}
  const cipher: SecretCipher = {
    available: () => available,
    encrypt: (text) => Buffer.from(`enc:${text}`),
    decrypt: (data) => {
      const text = data.toString()
      if (!text.startsWith('enc:')) throw new Error('bad data')
      return text.slice(4)
    }
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
  return { store: new CivitaiApiKeyStore(cipher, file), stored }
}

describe('CivitaiApiKeyStore', () => {
  it('keeps the key encrypted and hands it back to main', async () => {
    const { store, stored } = setup()
    await expect(store.status()).resolves.toEqual({ hasKey: false, canStore: true })
    await store.save('abcdef0123456789')
    expect(stored.data?.toString()).toBe('enc:abcdef0123456789')
    expect(stored.data?.toString()).not.toBe('abcdef0123456789')
    await expect(store.key()).resolves.toBe('abcdef0123456789')
    await expect(store.status()).resolves.toEqual({ hasKey: true, canStore: true })
  })

  it('forgets the key', async () => {
    const { store } = setup()
    await store.save('abcdef0123456789')
    await store.clear()
    await store.clear()
    await expect(store.key()).resolves.toBeUndefined()
    await expect(store.status()).resolves.toMatchObject({ hasKey: false })
  })

  it('refuses to keep a key without a secure place, and reports it', async () => {
    const { store, stored } = setup(false)
    await expect(store.save('abcdef0123456789')).rejects.toBeInstanceOf(KeyStorageUnavailableError)
    expect(stored.data).toBeUndefined()
    await expect(store.status()).resolves.toEqual({ hasKey: false, canStore: false })
  })

  it('does not use a stored key it can no longer read', async () => {
    const { store, stored } = setup()
    stored.data = Buffer.from('garbage')
    await expect(store.key()).resolves.toBeUndefined()
    await expect(store.status()).resolves.toMatchObject({ hasKey: false })
  })
})
