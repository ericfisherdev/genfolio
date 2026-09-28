import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FooocusLogParser, LogEntryKind } from './fooocus-log-parser'

const FIXTURES = resolve(__dirname, '../../../tests/fixtures/fooocus')
const parser = new FooocusLogParser()

const SPLIT = '<!--fooocus-log-split-->'
/** Python's `urllib.parse.quote(text, safe='')`, which also encodes the `!'()*` JS leaves alone. */
const pythonQuote = (text: string): string =>
  encodeURIComponent(text).replaceAll(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )
const payload = (fields: Record<string, unknown>): string =>
  `</br><button onclick="to_clipboard('${pythonQuote(JSON.stringify(fields))}')">Copy to Clipboard</button>`

/** An entry as Fooocus writes it: link, unescaped table rows, then the copy button. */
function entry(fileName: string, rows: [string, string][], tail = ''): string {
  const id = fileName.replaceAll('.', '_')
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td class='label'>${label}</td><td class='value'>${value}</td></tr>\n`
    )
    .join('')
  return (
    `<div id="${id}" class="image-container"><hr><table><tr>\n` +
    `<td><a href="${fileName}" target="_blank"><img src='${fileName}' loading='lazy'/></a><div>${fileName}</div></td>` +
    `<td><table class='metadata'>${table}</table>${tail}</td></tr></table></div>\n\n`
  )
}
const log = (...entries: string[]): string =>
  `<html><body><p>Fooocus Log</p>${SPLIT}\n\n${entries.join('')}\n${SPLIT}</body></html>`

describe('FooocusLogParser', () => {
  it('reads one entry per committed fixture, including the image without embedded metadata', () => {
    const entries = parser.parse(readFileSync(resolve(FIXTURES, 'log.html'), 'utf8'))
    const images = readdirSync(FIXTURES).filter((name) => /\.(png|webp|jpeg)$/.test(name))
    expect([...entries.keys()].sort()).toEqual(images.sort())
    const bare = entries.get('2026-09-27_20-47-27_2563.png')
    expect(bare?.kind).toBe(LogEntryKind.Generation)
    expect(bare?.fields).toMatchObject({
      base_model: 'sdxl/intorealism_sdxlV4.safetensors',
      lora_combined_1: 'sd_xl_dpo_lora_v1-128dim.safetensors : 0.5',
      seed: '4590034657615269725',
      steps: 30
    })
    expect(bare?.fields['prompt']).toContain('café table')
    expect(bare?.fields['prompt']).toContain('桜 petals')
  })

  it('keeps the payload when prompt HTML breaks the unescaped table', () => {
    const prompt = `a <b>bold</b></td></tr><tr><td class='label'>Seed</td><td class='value'>666</td></tr> to_clipboard('x') <a href="evil.png">`
    const html = log(
      entry(
        'real.png',
        [
          ['Prompt', prompt],
          ['Seed', '1']
        ],
        payload({ prompt, seed: '1' })
      )
    )
    const entries = parser.parse(html)
    expect([...entries.keys()]).toEqual(['real.png'])
    expect(entries.get('real.png')?.fields).toEqual({ prompt, seed: '1' })
  })

  it('reads an escaped UnFooocused table when there is no payload', () => {
    const marker = '<!--unfooocused-log-split-->'
    const body = entry('u.png', [
      ['Prompt', 'a &lt;cat&gt; &amp; &quot;dog&quot; &#x27;x&#x27; </br> line two'],
      ['Negative Prompt', 'blur'],
      ['Guidance Scale', '4.0'],
      ['Base Model', 'juggernaut.safetensors'],
      ['LoRA 1', 'detail.safetensors : 0.5'],
      ['Fooocus V2 Expansion', 'expanded']
    ])
    const entries = parser.parse(
      `<p>UnFooocused Log</p>${marker}\n\n${body}\n${marker}</body></html>`
    )
    expect(entries.get('u.png')).toEqual({
      kind: LogEntryKind.Generation,
      fields: {
        prompt: `a <cat> & "dog" 'x'\nline two`,
        negative_prompt: 'blur',
        guidance_scale: '4.0',
        base_model: 'juggernaut.safetensors',
        lora_combined_1: 'detail.safetensors : 0.5',
        prompt_expansion: 'expanded'
      }
    })
  })

  it('skips a malformed entry without affecting the others', () => {
    const broken = `<div id="broken_png" class="image-container"><button onclick="to_clipboard('%E0%A4%A')">\n\n`
    const html = log(
      entry('a.png', [], payload({ prompt: 'a' })),
      broken,
      entry('b.png', [], `<button onclick="to_clipboard('%7Bnot json')">`),
      entry('c.png', [], payload({ prompt: 'c' }))
    )
    expect([...parser.parse(html).keys()]).toEqual(['a.png', 'c.png'])
  })

  it('keeps the newest entry when a file name repeats', () => {
    const html = log(
      entry('a.png', [], payload({ seed: 'new' })),
      entry('a.png', [], payload({ seed: 'old' }))
    )
    expect(parser.parse(html).get('a.png')?.fields).toEqual({ seed: 'new' })
  })

  it('marks fast-upscale entries', () => {
    const html = log(entry('up.png', [], payload({ upscale_fast: '2x' })))
    expect(parser.parse(html).get('up.png')?.kind).toBe(LogEntryKind.Upscale)
  })

  it('falls back to the div id for the file name and reads logs without split markers', () => {
    const html = `<div id="my_image_webp" class="image-container">${payload({ seed: '3' })}</div>`
    expect([...parser.parse(html).keys()]).toEqual(['my_image.webp'])
  })

  it('does not start an entry at an image-container div inside prompt text', () => {
    const prompt = 'x <div id="victim_png" class="image-container"><a href="victim.png"> y'
    const html = log(
      entry('real.png', [['Prompt', prompt]], payload({ prompt, seed: '1' })),
      entry('victim.png', [], payload({ seed: 'truth' }))
    )
    const entries = parser.parse(html)
    expect(entries.get('real.png')?.fields).toEqual({ prompt, seed: '1' })
    expect(entries.get('victim.png')?.fields).toEqual({ seed: 'truth' })
  })

  it('reads a table of unclosed rows in linear time', () => {
    const body = entry('slow.png', []).replace(
      "<table class='metadata'>",
      `<table class='metadata'>${"<tr><td class='label'>".repeat(40_000)}`
    )
    const started = performance.now()
    parser.parse(log(body))
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('maps the table labels that are not plain snake case', () => {
    const upscale = parser.parse(log(entry('up.png', [['Upscale (Fast)', '2x']])))
    expect(upscale.get('up.png')).toEqual({
      kind: LogEntryKind.Upscale,
      fields: { upscale_fast: '2x' }
    })
    const cfg = parser.parse(log(entry('c.png', [['CFG Mimicking from TSNR', '7.0']])))
    expect(cfg.get('c.png')?.fields).toEqual({ adaptive_cfg: '7.0' })
  })

  it('accepts only bare file names', () => {
    const html = log(
      entry('../../secret.png', [], payload({ seed: '1' })),
      entry('sub/dir.png', [], payload({ seed: '2' })),
      entry('https://evil.example/x.png', [], payload({ seed: '3' })),
      entry('ok.png', [], payload({ seed: '4' }))
    )
    expect([...parser.parse(html).keys()]).toEqual(['ok.png'])
  })

  it('drops __proto__ keys from payloads', () => {
    const tail = `<button onclick="to_clipboard('${pythonQuote('{"__proto__":{"seed":"x"},"prompt":"p"}')}')">`
    const fields = parser.parse(log(entry('p.png', [], tail))).get('p.png')?.fields ?? {}
    expect(Object.keys(fields)).toEqual(['prompt'])
    expect(Object.assign({}, fields)).not.toHaveProperty('seed')
  })

  it('never throws on truncated or edited fixture text', () => {
    const text = readFileSync(resolve(FIXTURES, 'log.html'), 'utf8')
    let seed = 5
    const random = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    for (let round = 0; round < 200; round++) {
      const chars = [...text]
      for (let edit = 0; edit < 10; edit++) {
        chars.splice(
          Math.floor(random() * chars.length),
          1,
          ["'", '%', '"', '<', '>', ''][round % 6] ?? ''
        )
      }
      const edited = chars.slice(0, Math.floor(random() * (chars.length + 1))).join('')
      expect(() => parser.parse(edited)).not.toThrow()
    }
  })
})
