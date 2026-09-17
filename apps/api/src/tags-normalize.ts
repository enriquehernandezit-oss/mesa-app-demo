// One-off, idempotent normalize for legacy English occasion tags stored in
// rankings.tags (M14). The rank flow's own picker has always written
// Spanish (apps/mobile/src/lib/display.ts's OCCASION_TAGS, matching
// packages/db/src/seed-extra.ts's TAGS exactly) — but rows from an earlier,
// since-changed seed script predate that picker and are stored English.
// Explore/Rankings' occasion filter compares `tags.includes(f.occasion)`
// against the CANONICAL Spanish form; an English row never matches, so
// those rankings silently fall out of every occasion filter even though
// tagLabel() (display.ts) already shows them correctly translated. This
// script closes the gap in the data itself rather than the display layer.
//
// Mirrors apps/mobile/src/lib/display.ts's TAG_ES map exactly — keep the
// two in sync if either changes.
//
//   DATABASE_URL="<url>" bun run src/tags-normalize.ts [--dry-run]
//
// Always --dry-run first. Idempotent: a tag already in canonical Spanish
// form isn't in this map, so `TAG_ES[tag] ?? tag` is a no-op for it — a
// re-run only ever touches rows that still have a legacy English tag left.
import { db, pool, schema } from '@mesa/db'
import { isNotNull, sql } from 'drizzle-orm'

const { rankings } = schema

const TAG_ES: Record<string, string> = {
  'Date Night': 'Cena romántica',
  'Special Occasion': 'Ocasión especial',
  'Group Dinner': 'Cena en grupo',
  Outdoor: 'Al aire libre',
  'Fine Dining': 'Alta cocina',
  Casual: 'Informal',
  'Late Night': 'Trasnoche',
}

async function run() {
  const dryRun = process.argv.includes('--dry-run')
  console.log(`tags:normalize ${dryRun ? '(DRY RUN)' : ''}`)
  console.log('='.repeat(40))

  const rows = await db
    .select({ id: rankings.id, tags: rankings.tags })
    .from(rankings)
    .where(isNotNull(rankings.tags))

  let changed = 0
  const distribution = new Map<string, number>()
  for (const r of rows) {
    const tags = r.tags ?? []
    if (tags.length === 0) continue
    const normalized = tags.map((tag) => TAG_ES[tag] ?? tag)
    const hasChange = normalized.some((t, i) => t !== tags[i])
    if (!hasChange) continue
    changed++
    for (const tag of tags) {
      if (TAG_ES[tag]) distribution.set(tag, (distribution.get(tag) ?? 0) + 1)
    }
    if (!dryRun) {
      await db.update(rankings).set({ tags: normalized }).where(sql`${rankings.id} = ${r.id}`)
    }
  }

  console.log(`\n${rows.length} ranking(s) with tags scanned — ${changed} needed normalizing`)
  if (distribution.size) {
    console.log('  legacy English tag(s) found:')
    for (const [tag, n] of [...distribution.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    "${tag}" → "${TAG_ES[tag]}": ${n}`)
    }
  }
  console.log(`\n${'='.repeat(40)}`)
  console.log(dryRun ? 'Dry run — nothing written. Re-run without --dry-run to apply.' : 'Done.')
  await pool.end()
}

if (import.meta.main) {
  run().catch(async (err) => {
    console.error(err)
    await pool.end()
    process.exit(1)
  })
}
