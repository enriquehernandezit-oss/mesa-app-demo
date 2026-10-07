import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'

import { LEGACY_TAG_ES, TAGS } from './seed-extra'

// Migration 0041 rewrote the stored English tags to Spanish. If its pairs and LEGACY_TAG_ES drift, the
// app translates a tag on screen that the filter still cannot find.
const dir = `${import.meta.dir}/../drizzle`
const file = readdirSync(dir).find((f) => f.startsWith('0041_'))
const sql = file ? readFileSync(`${dir}/${file}`, 'utf8') : ''

describe('legacy tags and migration 0041', () => {
  test('every English tag is rewritten to its Spanish value', () => {
    expect(file).toBeDefined()
    for (const [en, es] of Object.entries(LEGACY_TAG_ES)) {
      expect(sql).toContain(`WHEN '${en}' THEN '${es}'`)
      expect(sql).toContain(`'${en}'`)
    }
  })

  test('every Spanish value is one the app offers', () => {
    for (const es of Object.values(LEGACY_TAG_ES)) expect(TAGS).toContain(es)
  })
})
