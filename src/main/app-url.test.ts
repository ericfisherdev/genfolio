import { describe, expect, it } from 'vitest'
import { isAppUrl, rendererEntryUrl, type RendererEntry } from './app-url'

const devServer: RendererEntry = { kind: 'dev-server', url: 'http://localhost:5173/' }
const bundled: RendererEntry = { kind: 'file', path: '/opt/genfolio/out/renderer/index.html' }

describe('rendererEntryUrl', () => {
  it('uses the dev server URL as-is', () => {
    expect(rendererEntryUrl(devServer)).toBe('http://localhost:5173/')
  })

  it('converts the bundled path to a file URL', () => {
    expect(rendererEntryUrl(bundled)).toBe('file:///opt/genfolio/out/renderer/index.html')
  })
})

describe('isAppUrl', () => {
  it('allows the dev server origin', () => {
    expect(isAppUrl('http://localhost:5173/#/album/3', devServer)).toBe(true)
  })

  it('allows the bundled document with a hash route', () => {
    expect(isAppUrl('file:///opt/genfolio/out/renderer/index.html#/x', bundled)).toBe(true)
  })

  it.each([
    'https://example.com/',
    'http://localhost:5174/',
    'file:///etc/passwd',
    'genfolio://img/1',
    'not a url'
  ])('blocks %s', (url) => {
    expect(isAppUrl(url, devServer)).toBe(false)
    expect(isAppUrl(url, bundled)).toBe(false)
  })
})
