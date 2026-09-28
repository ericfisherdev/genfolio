import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { KeywordScope, SetMatchMode } from '@shared/search-kinds'
import { matchExpression, parseKeywords } from './keyword-query'

describe('parseKeywords', () => {
  it.each([
    [
      'red hair',
      [
        ['red', false],
        ['hair', false]
      ],
      []
    ],
    [
      '"red hair" girl',
      [
        ['red hair', false],
        ['girl', false]
      ],
      []
    ],
    ['cyber* -blurry', [['cyber', true]], [['blurry', false]]],
    [
      '-"low quality" -bad*',
      [],
      [
        ['low quality', false],
        ['bad', true]
      ]
    ],
    ['"studio lighting:1.2"*', [['studio lighting:1.2', true]], []],
    ['"unclosed phrase', [['unclosed phrase', false]], []],
    [
      '  café   桜  ',
      [
        ['café', false],
        ['桜', false]
      ],
      []
    ],
    [
      'AND OR NOT NEAR',
      [
        ['AND', false],
        ['OR', false],
        ['NOT', false],
        ['NEAR', false]
      ],
      []
    ],
    ['( ) : - * "" ^', [], []],
    ['', [], []]
  ])('%j', (input, include, exclude) => {
    const query = parseKeywords(input)
    expect(query.include.map((t) => [t.text, t.prefix])).toEqual(include)
    expect(query.exclude.map((t) => [t.text, t.prefix])).toEqual(exclude)
  })
})

describe('matchExpression', () => {
  it('quotes every term and scopes the columns', () => {
    const { include } = parseKeywords('"red hair" cyber*')
    expect(matchExpression(include, KeywordScope.Both, SetMatchMode.All)).toBe(
      '{prompt negative_prompt} : ("red hair" AND "cyber"*)'
    )
    expect(matchExpression(include, KeywordScope.Negative, SetMatchMode.Any)).toBe(
      '{negative_prompt} : ("red hair" OR "cyber"*)'
    )
    expect(matchExpression([], KeywordScope.Positive, SetMatchMode.All)).toBeUndefined()
  })
})

describe('against a real FTS5 index', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE VIRTUAL TABLE f USING fts5(prompt, negative_prompt,
      tokenize = 'unicode61 remove_diacritics 2');
    INSERT INTO f (rowid, prompt, negative_prompt) VALUES
      (1, 'red hair, cyberpunk girl, (studio lighting:1.2)', 'blurry, low quality'),
      (2, 'blue sky over a café', 'red'),
      (3, 'red car', 'bad hands');
  `)
  const match = (expression: string | undefined): number[] =>
    expression === undefined
      ? []
      : (db
          .prepare('SELECT rowid FROM f WHERE f MATCH ? ORDER BY rowid')
          .pluck()
          .all(expression) as number[])
  const search = (input: string, scope = KeywordScope.Positive): number[] =>
    match(matchExpression(parseKeywords(input).include, scope, SetMatchMode.All))

  it('matches phrases, prefixes, scopes and diacritics', () => {
    expect(search('red')).toEqual([1, 3])
    expect(search('"red hair"')).toEqual([1])
    expect(search('"hair red"')).toEqual([])
    expect(search('cyber*')).toEqual([1])
    expect(search('red', KeywordScope.Negative)).toEqual([2])
    expect(search('red', KeywordScope.Both)).toEqual([1, 2, 3])
    expect(search('cafe')).toEqual([2])
    expect(search('lighting:1.2')).toEqual([1])
  })

  it('never builds an expression FTS5 rejects, whatever is typed', () => {
    let seed = 3
    const random = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const alphabet = [...'ab c"-*():^{}+,.\'\\\t\n', 'AND', 'OR', 'NOT', 'NEAR', 'é', '桜', '😀']
    for (let round = 0; round < 3000; round++) {
      const length = Math.floor(random() * 20)
      const input = Array.from(
        { length },
        () => alphabet[Math.floor(random() * alphabet.length)]
      ).join('')
      const query = parseKeywords(input)
      for (const scope of Object.values(KeywordScope)) {
        for (const mode of Object.values(SetMatchMode)) {
          expect(() => match(matchExpression(query.include, scope, mode))).not.toThrow()
          expect(() => match(matchExpression(query.exclude, scope, mode))).not.toThrow()
        }
      }
    }
  })
})
