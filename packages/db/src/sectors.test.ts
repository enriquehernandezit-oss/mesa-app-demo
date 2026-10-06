import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'

import { EXISTING_SECTOR_ALIASES, NEW_SECTORS } from './sectors'

// The seed reads sectors.ts; production gets the same sectors from migration 0040's SQL. If the two
// drift, a fresh database and the real one disagree about what sectors exist.
const dir = `${import.meta.dir}/../drizzle`
const file = readdirSync(dir).find((f) => f.startsWith('0040_'))
const sql = file ? readFileSync(`${dir}/${file}`, 'utf8') : ''

describe('sectors.ts and migration 0040', () => {
  test('every new sector is inserted with the same numbers and aliases', () => {
    expect(file).toBeDefined()
    for (const s of NEW_SECTORS) {
      const aliases = s.aliases.length ? `'{${s.aliases.map((a) => `"${a}"`).join(',')}}'` : "'{}'"
      expect(sql).toContain(
        `('${s.slug}', '${s.name}', ${s.lat}, ${s.lng}, ${s.radiusM}, ${aliases})`,
      )
    }
  })

  test("the existing sectors' aliases are set", () => {
    for (const [slug, aliases] of Object.entries(EXISTING_SECTOR_ALIASES)) {
      expect(sql).toContain(
        `'{${aliases.map((a) => `"${a}"`).join(',')}}' WHERE "slug" = '${slug}'`,
      )
    }
  })

  test('slugs are unique and every sector sits inside Santo Domingo', () => {
    expect(new Set(NEW_SECTORS.map((s) => s.slug)).size).toBe(NEW_SECTORS.length)
    for (const s of NEW_SECTORS) {
      expect(s.lat).toBeGreaterThan(18.4)
      expect(s.lat).toBeLessThan(18.55)
      expect(s.lng).toBeGreaterThan(-70.0)
      expect(s.lng).toBeLessThan(-69.85)
    }
  })
})
