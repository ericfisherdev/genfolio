import { describe, expect, it } from 'vitest'
import { ImageDisplay } from '@shared/display-rendition'
import { parseImageRequest } from './image-request'

describe('parseImageRequest', () => {
  it('reads the id, display mode, width and version', () => {
    expect(parseImageRequest('genfolio://img/42')).toEqual({
      imageId: 42,
      display: ImageDisplay.Original,
      version: undefined
    })
    expect(parseImageRequest('genfolio://img/42?v=1234')).toEqual({
      imageId: 42,
      display: ImageDisplay.Original,
      version: 1234
    })
    expect(parseImageRequest('genfolio://img/42?display=grid')).toEqual({
      imageId: 42,
      display: ImageDisplay.Grid,
      width: 400,
      version: undefined
    })
    expect(parseImageRequest('genfolio://img/42?display=grid&w=800&v=9')).toEqual({
      imageId: 42,
      display: ImageDisplay.Grid,
      width: 800,
      version: 9
    })
  })

  it.each([
    'genfolio://img/0',
    'genfolio://img/-1',
    'genfolio://img/1.5',
    'genfolio://img/abc',
    'genfolio://img/42/extra',
    'genfolio://img/..%2F..%2Fetc%2Fpasswd',
    'genfolio://img/%2Fetc%2Fpasswd',
    'genfolio://other/42',
    'genfolio://img/42?display=huge',
    'genfolio://img/42?display=grid&w=500',
    'genfolio://img/42?display=grid&w=4096',
    'genfolio://img/42?w=400',
    'genfolio://img/42?v=-1',
    'genfolio://img/42?v=abc',
    'genfolio://img/42?v=12345678901',
    'genfolio://img/99999999999999999999',
    'not a url'
  ])('rejects %s', (url) => {
    expect(parseImageRequest(url)).toBeUndefined()
  })
})
