import { describe, expect, it, vi } from 'vitest'
import { UpdatePhase } from '@shared/update-kinds'
import type { UpdateEvent } from '@shared/updates'
import { fakeGenfolioApi } from '../testing/fake-genfolio-api'
import type { NoticeAction } from './notice-sink'
import { UpdateNotices } from './update-notices'

const event = (phase: UpdatePhase, extra: Partial<UpdateEvent> = {}): UpdateEvent => ({
  phase,
  version: '0.2.0',
  progress: null,
  message: null,
  ...extra
})

function setUp(): {
  emit: (event: UpdateEvent) => void
  notices: string[]
  actions: (NoticeAction | undefined)[]
  cancel: ReturnType<typeof vi.fn>
  dismissed: number
} {
  let listener: ((event: UpdateEvent) => void) | undefined
  const state = {
    notices: [] as string[],
    actions: [] as (NoticeAction | undefined)[],
    dismissed: 0
  }
  const cancel = vi.fn(async () => undefined)
  new UpdateNotices(
    fakeGenfolioApi({
      onUpdateEvent: (subscriber) => {
        listener = subscriber
        return () => undefined
      },
      cancelUpdateDownload: cancel
    }),
    {
      notify: (message, action) => {
        state.notices.push(message)
        state.actions.push(action)
      },
      dismissNotice: () => state.dismissed++
    }
  )
  return {
    emit: (update) => listener?.(update),
    cancel,
    get notices() {
      return state.notices
    },
    get actions() {
      return state.actions
    },
    get dismissed() {
      return state.dismissed
    }
  }
}

describe('UpdateNotices', () => {
  it('shows download progress with a Cancel action that stops the download', () => {
    const { emit, notices, actions, cancel } = setUp()
    emit(
      event(UpdatePhase.Downloading, {
        progress: { percent: 0, transferredBytes: 0, totalBytes: 0 }
      })
    )
    emit(
      event(UpdatePhase.Downloading, {
        progress: { percent: 42.7, transferredBytes: 60_000_000, totalBytes: 144_000_000 }
      })
    )
    expect(notices).toEqual([
      'Downloading Genfolio 0.2.0…',
      'Downloading Genfolio 0.2.0… 42% (60 MB of 144 MB)'
    ])
    expect(actions[1]?.label).toBe('Cancel')
    actions[1]?.run()
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('reports the phases that end or pause the flow, and clears "Checking" for the dialogs', () => {
    const state = setUp()
    state.emit(event(UpdatePhase.Checking, { version: null }))
    state.emit(event(UpdatePhase.Available))
    state.emit(event(UpdatePhase.Downloaded))
    state.emit(event(UpdatePhase.Installing))
    state.emit(event(UpdatePhase.Cancelled))
    state.emit(event(UpdatePhase.Failed, { version: null, message: 'checksum mismatch' }))
    state.emit(event(UpdatePhase.UpToDate, { version: null }))
    expect(state.notices).toEqual([
      'Checking for updates…',
      'Genfolio 0.2.0 is downloaded and ready to install.',
      'Installing Genfolio 0.2.0…',
      'The update download was cancelled.',
      'Could not update Genfolio: checksum mismatch'
    ])
    expect(state.dismissed).toBe(2)
  })
})
