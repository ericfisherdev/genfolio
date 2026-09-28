import { describe, expect, it } from 'vitest'
import { ImageDisplay } from '@shared/display-rendition'
import { parseImageRequest } from './image-request'

describe('parseImageRequest', () => {
  it('reads the id and display mode', () => {
    expect(parseImageRequest('genfolio://img/42')).toEqual({
      imageId: 42,
      display: ImageDisplay.Original
    })
    expect(parseImageRequest('genfolio://img/42?display=grid')).toEqual({
      imageId: 42,
      display: ImageDisplay.Grid
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
    'genfolio://img/99999999999999999999',
    'not a url'
  ])('rejects %s', (url) => {
    expect(parseImageRequest(url)).toBeUndefined()
  })
})
