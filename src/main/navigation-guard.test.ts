import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { RendererEntry } from './app-url'
import { guardNavigation, type GuardedContents } from './navigation-guard'

const entry: RendererEntry = { kind: 'file', path: '/opt/genfolio/out/renderer/index.html' }
const APP_URL = 'file:///opt/genfolio/out/renderer/index.html'
const FOREIGN_URL = 'https://attacker.example/'

class FakeContents extends EventEmitter {
  readonly setWindowOpenHandler = vi.fn()
}

function guarded(): FakeContents {
  const contents = new FakeContents()
  guardNavigation(contents as unknown as GuardedContents, entry)
  return contents
}

function attempt(url: string): { url: string; preventDefault: ReturnType<typeof vi.fn> } {
  return { url, preventDefault: vi.fn() }
}

describe('guardNavigation', () => {
  it('denies every new window', () => {
    const contents = guarded()
    const handler = contents.setWindowOpenHandler.mock.calls[0]?.[0] as () => unknown
    expect(handler()).toEqual({ action: 'deny' })
  })

  it.each(['will-frame-navigate', 'will-redirect'])('%s blocks foreign URLs', (event) => {
    const contents = guarded()
    const foreign = attempt(FOREIGN_URL)
    contents.emit(event, foreign)
    expect(foreign.preventDefault).toHaveBeenCalledOnce()
  })

  it.each(['will-frame-navigate', 'will-redirect'])('%s allows the app document', (event) => {
    const contents = guarded()
    const own = attempt(`${APP_URL}#/albums`)
    contents.emit(event, own)
    expect(own.preventDefault).not.toHaveBeenCalled()
  })
})
