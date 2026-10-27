import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { MigrationRunner } from '../migration-runner'
import { migrations } from '.'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
})

const tag = (name: string, key = name.toLowerCase()): void => {
  db.prepare('INSERT INTO model_tags (name, name_key, created_at) VALUES (?, ?, 1)').run(name, key)
}
const link = (tagId: number, kind: string, identity: string): void => {
  db.prepare(
    'INSERT INTO model_tag_links (tag_id, kind, identity, created_at) VALUES (?, ?, ?, 1)'
  ).run(tagId, kind, identity)
}
const count = (table: string): number =>
  db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get() as number

describe('migration 011: model tags', () => {
  it('upgrades a version 10 database, keeping its image tags apart from model tags', () => {
    new MigrationRunner(db, migrations.slice(0, 10)).migrate()
    db.prepare("INSERT INTO tags (name, name_key, created_at) VALUES ('red', 'red', 1)").run()
    expect(db.pragma('user_version', { simple: true })).toBe(10)

    new MigrationRunner(db, migrations).migrate()

    expect(db.pragma('user_version', { simple: true })).toBe(11)
    expect([count('tags'), count('model_tags'), count('model_tag_links')]).toEqual([1, 0, 0])
  })

  it('keeps names non-blank and unique on their folded key', () => {
    new MigrationRunner(db, migrations).migrate()
    tag('Élan', 'élan')
    expect(() => tag('ÉLAN', 'élan')).toThrow(/UNIQUE/)
    expect(() => tag('  ', ' ')).toThrow(/CHECK/)
    expect(() => tag('ok', '')).toThrow(/CHECK/)
  })

  it('links a tag to a model once, by a known kind and a non-empty identity', () => {
    new MigrationRunner(db, migrations).migrate()
    tag('lighting')
    link(1, 'lora', 'detail')
    link(1, 'checkpoint', 'detail')
    expect(() => link(1, 'lora', 'detail')).toThrow(/UNIQUE/)
    expect(() => link(1, 'refiner', 'detail')).toThrow(/CHECK/)
    expect(() => link(1, 'lora', '')).toThrow(/CHECK/)
    expect(() => link(2, 'lora', 'detail')).toThrow(/FOREIGN KEY/)
  })

  it('cascades a deleted tag to its links', () => {
    new MigrationRunner(db, migrations).migrate()
    tag('lighting')
    tag('celebrity')
    link(1, 'lora', 'detail')
    link(1, 'lora', 'style')
    link(2, 'lora', 'detail')
    db.exec('DELETE FROM model_tags WHERE id = 1')
    expect(count('model_tag_links')).toBe(1)
    expect(db.prepare('SELECT tag_id FROM model_tag_links').pluck().get()).toBe(2)
  })

  it('finds a model’s tags from the (kind, identity) index', () => {
    new MigrationRunner(db, migrations).migrate()
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT tag_id FROM model_tag_links
         WHERE kind = 'lora' AND identity = 'detail'`
      )
      .all()
      .map((row) => (row as { detail: string }).detail)
      .join(' | ')
    expect(plan).toContain('model_tag_links_model')
  })
})
