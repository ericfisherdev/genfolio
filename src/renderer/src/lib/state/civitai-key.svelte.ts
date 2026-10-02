import type { CivitaiKeyStatus } from '@shared/civitai-key'
import type { GenfolioApi } from '@shared/genfolio-api'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type KeyApi = Pick<GenfolioApi, 'getCivitaiKeyStatus' | 'setCivitaiKey' | 'clearCivitaiKey'>

/**
 * Whether a Civitai API key is saved. The key goes to main once, when saved, and is never read
 * back. Reports failures in the notice bar; never rejects.
 */
export class CivitaiKeyState {
  status: CivitaiKeyStatus = $state({ hasKey: false, canStore: true })
  loaded = $state(false)

  constructor(
    private readonly api: KeyApi,
    private readonly notices: NoticeSink
  ) {}

  async load(): Promise<void> {
    await this.attempt('check for a Civitai API key', () => this.api.getCivitaiKeyStatus())
    this.loaded = true
  }

  /** Resolves whether the key was saved. */
  async save(key: string): Promise<boolean> {
    return this.attempt('save the Civitai API key', () => this.api.setCivitaiKey(key))
  }

  async clear(): Promise<void> {
    await this.attempt('remove the Civitai API key', () => this.api.clearCivitaiKey())
  }

  private async attempt(
    description: string,
    work: () => Promise<CivitaiKeyStatus>
  ): Promise<boolean> {
    try {
      this.status = await work()
      return true
    } catch (error) {
      this.notices.notify(`Could not ${description}: ${userMessage(error)}`)
      return false
    }
  }
}
