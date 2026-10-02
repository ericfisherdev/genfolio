import { describe, expect, it } from 'vitest'
import { htmlToText } from './html-to-text'

describe('htmlToText', () => {
  it('keeps paragraphs and line breaks and drops the tags', () => {
    expect(
      htmlToText(
        '<p>Detail tweaker for SDXL.</p><p>Works with <b>weights</b> [-3, 3]<br>Use positive weight.</p>'
      )
    ).toBe('Detail tweaker for SDXL.\nWorks with weights [-3, 3]\nUse positive weight.')
  })

  it('turns list items into bullet lines', () => {
    expect(htmlToText('<ul><li>one</li><li>two</li></ul>')).toBe('• one\n• two')
  })

  it('decodes entities once, so decoded markup stays text', () => {
    expect(htmlToText('a &amp; b &lt;b&gt; &quot;q&quot; &#39;s&#39; &#x41; &nbsp;x')).toBe(
      'a & b <b> "q" \'s\' A  x'
    )
    expect(htmlToText('&amp;lt;')).toBe('&lt;')
  })

  it('leaves an unknown or invalid entity as written', () => {
    expect(htmlToText('&bogus; &#0; &#xD800; &#99999999;')).toBe(
      '&bogus; &#0; &#xD800; &#99999999;'
    )
  })

  it('removes script and style contents, not just their tags', () => {
    expect(htmlToText('hi<script>alert(1)</script><style>p{}</style> there')).toBe('hi there')
  })

  it('collapses runs of blank lines and trims', () => {
    expect(htmlToText('<p>a</p><p></p><p></p><p>b</p>')).toBe('a\n\nb')
  })

  it('is null when nothing readable is left', () => {
    expect(htmlToText(null)).toBeNull()
    expect(htmlToText(undefined)).toBeNull()
    expect(htmlToText('')).toBeNull()
    expect(htmlToText('<p> </p><br>')).toBeNull()
  })

  it('does not choke on an unclosed tag', () => {
    expect(htmlToText('text <b unclosed')).toBe('text <b unclosed')
  })
})
