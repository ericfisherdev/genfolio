import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GenerationFormat, GeneratorKind } from '@shared/generation-kinds'
import { ImageFormat } from '@shared/image-format'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { MetadataRecordReader } from '../metadata-record-reader'
import { A1111InfotextParser } from './a1111-infotext-parser'
import { FooocusJsonParser } from './fooocus-json-parser'
import { GenerationRecordParser } from './generation-record-parser'
import { UnFooocusedParser } from './unfooocused-parser'

const FIXTURES = resolve(__dirname, '../../../../tests/fixtures/fooocus')
const IMAGES = readdirSync(FIXTURES).filter((name) => /\.(png|webp|jpeg)$/.test(name))
const formatOf = (name: string): ImageFormat =>
  name.endsWith('.png')
    ? ImageFormat.Png
    : name.endsWith('.webp')
      ? ImageFormat.Webp
      : ImageFormat.Jpeg

const a1111 = new A1111InfotextParser()
const fooocusJson = new FooocusJsonParser()
const unFooocused = new UnFooocusedParser()
const recordParser = new GenerationRecordParser([fooocusJson, unFooocused, a1111])

describe('committed Fooocus fixtures', () => {
  it.each(IMAGES)('%s matches its golden file', async (name) => {
    const records = await new MetadataRecordReader().read(join(FIXTURES, name), formatOf(name))
    const golden = readFileSync(join(FIXTURES, 'expected', name.replace(/\.\w+$/, '.json')), 'utf8')
    expect(recordParser.parse(records)).toEqual(JSON.parse(golden))
  })
})

describe('A1111InfotextParser', () => {
  const PARAMS = 'Steps: 20, Sampler: Euler a, CFG scale: 7, Seed: 42, Size: 512x768, Model: sd15'

  it('reads a multi-line prompt, a multi-line negative prompt and the params line', () => {
    const generation = a1111.parse(`line one\nline two\nNegative prompt: bad\nworse\n${PARAMS}`)
    expect(generation).toMatchObject({
      generator: GeneratorKind.A1111,
      prompt: 'line one\nline two',
      negativePrompt: 'bad\nworse',
      steps: 20,
      sampler: 'Euler a',
      cfgScale: 7,
      seed: '42',
      width: 512,
      height: 768,
      checkpoint: { name: 'sd15', hash: null }
    })
  })

  it('leaves the negative prompt out when there is none', () => {
    expect(a1111.parse(`just a prompt\n${PARAMS}`)).not.toHaveProperty('negativePrompt')
  })

  it('JSON-unquotes quoted values containing commas and colons', () => {
    const generation = a1111.parse(
      `p\n${PARAMS}, Lora hashes: "detail: 0123456789ab, style: ba9876543210", Note: "a, b: c \\"q\\""`
    )
    expect(generation?.params['Note']).toBe('a, b: c "q"')
    expect(generation?.params['Lora hashes']).toBe('detail: 0123456789ab, style: ba9876543210')
  })

  it('only treats a last line with at least three pairs as params', () => {
    expect(a1111.parse('a photo\nstyle: noir, mood: dark')).toBeUndefined()
    expect(a1111.parse('OLYMPUS DIGITAL CAMERA')).toBeUndefined()
    expect(a1111.parse('a photo\nstyle: noir, mood: dark, light: low')?.prompt).toBe('a photo')
  })

  it('reads only plain decimal numbers', () => {
    const generation = a1111.parse(`p\nSteps: 0x10, CFG scale: 0x10, Seed: 1, Size: 1x1`)
    expect(generation).not.toHaveProperty('steps')
    expect(generation).not.toHaveProperty('cfgScale')
    expect(a1111.parse(`p\nSteps: 20, CFG scale: 7.5, Seed: 1`)?.cfgScale).toBe(7.5)
    expect(a1111.parse(`p\nSteps: 20, CFG scale: .5, Seed: 1`)?.cfgScale).toBe(0.5)
  })

  it('keeps an old combined sampler name without inventing a schedule type', () => {
    const generation = a1111.parse(`p\nSteps: 20, Sampler: DPM++ 2M Karras, Seed: 1`)
    expect(generation?.sampler).toBe('DPM++ 2M Karras')
    expect(generation).not.toHaveProperty('scheduler')
    expect(a1111.parse(`p\nSteps: 20, Sampler: DPM++ 2M, Schedule type: Karras`)?.scheduler).toBe(
      'Karras'
    )
  })

  it('gives a LoRA known only from Lora hashes a null weight, and takes a prompt tag weight', () => {
    const hashesOnly = a1111.parse(`p\n${PARAMS}, Lora hashes: "detail: 0123456789AB"`)
    expect(hashesOnly?.loras).toEqual([{ name: 'detail', weight: null, hash: '0123456789ab' }])
    const tagged = a1111.parse(
      `p <lora:detail:0.8> <lora:bare>\n${PARAMS}, Lora hashes: "detail: 0123456789ab"`
    )
    expect(tagged?.loras).toEqual([
      { name: 'detail', weight: 0.8, hash: '0123456789ab' },
      { name: 'bare', weight: 1, hash: null }
    ])
    expect(tagged?.prompt).toBe('p <lora:detail:0.8> <lora:bare>')
  })

  it('reads tags with further arguments after the multiplier', () => {
    for (const tag of [
      '<lora:detail:0.8:0.5:lbw=OUTALL>',
      '<lora:detail:0.8:lbw=1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1>',
      '<lora:detail:0.8:te=0.5:unet=0.8>'
    ]) {
      expect(a1111.parse(`p ${tag}\nSteps: 1, Seed: 2, CFG scale: 3`)?.loras).toEqual([
        { name: 'detail', weight: 0.8, hash: null }
      ])
    }
  })

  it('prefers Lora weights, then legacy three-part hashes, over prompt tags', () => {
    const generation = a1111.parse(
      `p <lora:a:0.1> <lora:b:0.1>\n${PARAMS}, Lora hashes: "a: 0123456789, b: 9876543210: 0.7", Lora weights: "a: 0.5"`
    )
    expect(generation?.loras).toEqual([
      { name: 'a', weight: 0.5, hash: '0123456789' },
      { name: 'b', weight: 0.7, hash: '9876543210' }
    ])
  })

  it('reads a refiner written as name [hash] and strips model folders and extensions', () => {
    const generation = a1111.parse(
      `p\n${PARAMS.replace('Model: sd15', 'Model: sdxl/base.safetensors')}, Refiner: sd_xl_refiner_1.0 [7440042BBD]`
    )
    expect(generation?.checkpoint).toEqual({ name: 'base', hash: null })
    expect(generation?.refiner).toEqual({ name: 'sd_xl_refiner_1.0', hash: '7440042bbd' })
  })

  it('names Fooocus as the generator from its Version', () => {
    expect(a1111.parse(`p\n${PARAMS}, Version: Fooocus v2.5.5`)?.generator).toBe(
      GeneratorKind.Fooocus
    )
    expect(a1111.parse(`p\n${PARAMS}, Version: v1.10.1`)?.generator).toBe(GeneratorKind.A1111)
  })
})

describe('FooocusJsonParser', () => {
  it('drops __proto__ keys from untrusted JSON', () => {
    const generation = fooocusJson.parse('{"__proto__": {"seed": "x"}, "base_model": "m"}')
    expect(Object.keys(generation?.params ?? {})).toEqual(['base_model'])
    expect(Object.assign({}, generation?.params)).not.toHaveProperty('seed')
  })

  it('reads lora_combined_N when there is no loras list, in index order', () => {
    const generation = fooocusJson.parse(
      JSON.stringify({
        base_model: 'm.safetensors',
        lora_combined_2: 'folder/b.safetensors : 0.25',
        lora_combined_1: 'a.safetensors : 1.5',
        styles: `['Fooocus V2', "It's"]`,
        seed: 7
      })
    )
    expect(generation).toMatchObject({
      checkpoint: { name: 'm', hash: null },
      loras: [
        { name: 'a', weight: 1.5, hash: null },
        { name: 'b', weight: 0.25, hash: null }
      ],
      styles: ['Fooocus V2', "It's"],
      seed: '7'
    })
  })

  it('skips a None refiner and keeps non-string values as JSON text in params', () => {
    const generation = fooocusJson.parse(
      JSON.stringify({ base_model: 'm', refiner_model: 'None', loras: [['a', 0.5, 'abc']] })
    )
    expect(generation).not.toHaveProperty('refiner')
    expect(generation?.params['loras']).toBe('[["a",0.5,"abc"]]')
  })

  it('declines SwarmUI JSON, other JSON and non-JSON', () => {
    expect(
      fooocusJson.parse(JSON.stringify({ sui_image_params: { prompt: 'x' }, base_model: 'm' }))
    ).toBeUndefined()
    expect(fooocusJson.parse(JSON.stringify({ prompt: 'x' }))).toBeUndefined()
    expect(fooocusJson.parse('[1, 2]')).toBeUndefined()
    expect(fooocusJson.parse('{not json')).toBeUndefined()
  })
})

describe('UnFooocusedParser', () => {
  it('reads the prompt and steps', () => {
    expect(unFooocused.parse('a cat\non a mat\nSteps: 30')).toEqual({
      generator: GeneratorKind.UnFooocused,
      prompt: 'a cat\non a mat',
      steps: 30,
      params: { Steps: '30' }
    })
  })

  it('declines other shapes', () => {
    expect(unFooocused.parse('Steps: 30')).toBeUndefined()
    expect(unFooocused.parse('a cat\nSteps: 30, Seed: 1, CFG scale: 7')).toBeUndefined()
  })
})

describe('GenerationRecordParser', () => {
  it('parses only generation-carrying records, tagging each with its origin', () => {
    const generations = recordParser.parse([
      { origin: MetadataOrigin.ExifSoftware, key: 'Software', value: 'a\nSteps: 1' },
      { origin: MetadataOrigin.PngText, key: 'fooocus_scheme', value: 'a\nSteps: 1' },
      {
        origin: MetadataOrigin.ExifImageDescription,
        key: 'ImageDescription',
        value: 'a cat\nSteps: 30'
      },
      { origin: MetadataOrigin.SidecarTxt, key: 'parameters', value: 'OLYMPUS DIGITAL CAMERA' }
    ])
    expect(generations).toEqual([
      {
        origin: MetadataOrigin.ExifImageDescription,
        format: GenerationFormat.UnFooocusedText,
        generation: {
          generator: GeneratorKind.UnFooocused,
          prompt: 'a cat',
          steps: 30,
          params: { Steps: '30' }
        }
      }
    ])
  })
})

describe('robustness', () => {
  it('parses hostile long lines in linear time', () => {
    const long = 'a'.repeat(200_000)
    const started = performance.now()
    a1111.parse(`p\n${long}`)
    a1111.parse(`p\n${'ab '.repeat(100_000)}`)
    a1111.parse(`p\n${' '.repeat(300_000)}x`)
    a1111.parse(`p\nSteps: 1, Seed: 2, Model: a${' '.repeat(200_000)}x]`)
    fooocusJson.parse(JSON.stringify({ base_model: 'm', styles: "'\\".repeat(100_000) }))
    a1111.parse(`p\nSteps: 1, Seed: 2, CFG scale: ${'1'.repeat(100_000)}x`)
    a1111.parse(`${'<lora:a'.repeat(30_000)}\nSteps: 1, Seed: 2, CFG scale: 3`)
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('never throws on random edits of fixture text', async () => {
    let seed = 11
    const random = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const alphabet = ['"', ',', ':', '\n', '\\', '{', '}', '[', ']', '<', '>', "'", 'x', '0', ' ']
    const texts = (
      await Promise.all(
        IMAGES.map((name) => new MetadataRecordReader().read(join(FIXTURES, name), formatOf(name)))
      )
    )
      .flat()
      .map((record) => record.value)
    for (const text of texts) {
      for (let round = 0; round < 200; round++) {
        const chars = [...text]
        for (let edit = 0; edit < 8; edit++) {
          const at = Math.floor(random() * chars.length)
          const choice = random()
          if (choice < 0.4) chars.splice(at, 1)
          else
            chars.splice(
              at,
              choice < 0.7 ? 1 : 0,
              alphabet[Math.floor(random() * alphabet.length)] ?? ''
            )
        }
        const edited = chars.slice(0, Math.floor(random() * (chars.length + 1))).join('')
        for (const parser of [a1111, fooocusJson, unFooocused]) {
          expect(() => parser.parse(edited)).not.toThrow()
        }
      }
    }
  })
})
