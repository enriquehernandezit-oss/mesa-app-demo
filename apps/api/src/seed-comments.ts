// Fills existing rankings with demo comment threads.
//
// `bun db:seed` grows comments too, but it TRUNCATES first — it rebuilds the
// whole demo world, so it refuses to run once a real catalog import or any
// menu data is present (see its own guard). This script is the additive half:
// it only ever INSERTS ranking_comments, touches no existing row, and skips
// any ranking that already has a thread, so it's safe to point at a database
// that holds real data and safe to run twice.
//
//   DATABASE_URL="<url>" bun run --filter @mesa/api seed:comments [--dry-run]
//
// Comments come only from people who FOLLOW the ranking's author: a comment
// from someone who can't see the post is a thread nobody could have written.

import { COMMENT_TEMPLATES, db, pool, schema } from '@mesa/db'
import { sql } from 'drizzle-orm'

const DRY = process.argv.includes('--dry-run')

// Every decision about a ranking's thread is derived from the ranking's OWN
// id, not from one running generator. That's what makes a second run a
// no-op: a draw-order generator hands the posts it skipped a fresh roll next
// time, so re-running kept adding threads to previously-quiet posts until
// nearly everything had one. Seeded off the id, a quiet post stays quiet.
function seededRandom(key: string): () => number {
  let a = 0
  for (let i = 0; i < key.length; i++) a = (Math.imul(a, 31) + key.charCodeAt(i)) | 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function main() {
  const { rankings, rankingComments, follows, restaurants } = schema

  // One pass for the three things a thread needs: the post, who follows its
  // author, and whether it already has comments. Aggregated in SQL rather
  // than looped per ranking (CLAUDE.md rule 3).
  const rows = await db
    .select({
      id: rankings.id,
      userId: rankings.userId,
      createdAt: rankings.createdAt,
      followers: sql<
        string[]
      >`coalesce(array_agg(distinct ${follows.followerId}) filter (where ${follows.followerId} is not null), '{}')`,
      existing: sql<number>`count(distinct ${rankingComments.id})::int`,
    })
    .from(rankings)
    .leftJoin(follows, sql`${follows.followingId} = ${rankings.userId}`)
    .leftJoin(rankingComments, sql`${rankingComments.rankingId} = ${rankings.id}`)
    .groupBy(rankings.id, rankings.userId, rankings.createdAt)

  const names = (await db.select({ name: restaurants.name }).from(restaurants)).map((r) => r.name)
  if (names.length === 0) {
    console.log('no restaurants — nothing to comment on')
    return
  }

  const toInsert: (typeof rankingComments.$inferInsert)[] = []
  let skippedNoFollowers = 0
  let skippedHasThread = 0

  for (const r of rows) {
    const rand = seededRandom(r.id)
    if (r.existing > 0) {
      skippedHasThread++
      continue
    }
    if (r.followers.length === 0) {
      skippedNoFollowers++
      continue
    }
    // Most posts stay quiet. A thread under every single one reads as noise
    // rather than as a place people actually talked about.
    if (rand() > 0.45) continue

    const howMany = 1 + Math.floor(rand() * 3)
    const seen = new Set<string>()
    for (let k = 0; k < howMany; k++) {
      const author = r.followers[Math.floor(rand() * r.followers.length)]
      if (!author || seen.has(author)) continue
      seen.add(author)
      const template = COMMENT_TEMPLATES[Math.floor(rand() * COMMENT_TEMPLATES.length)] as string
      // {name} is a comparison to ANOTHER place ("Mejor que X"), so it must
      // never resolve to the one being commented on.
      const other = names[Math.floor(rand() * names.length)] as string
      toInsert.push({
        rankingId: r.id,
        userId: author,
        body: template.replace('{name}', other),
        // After the post it answers, never before — a feed sorted by recency
        // would otherwise show a reply that predates its own post.
        createdAt: new Date(r.createdAt.getTime() + (0.5 + rand() * 6) * 60 * 60 * 1000),
      })
    }
  }

  if (!DRY && toInsert.length > 0) {
    await db.insert(rankingComments).values(toInsert)
  }
  console.log(
    `${DRY ? 'comments (DRY RUN)' : 'comments'}: ${rows.length} rankings scanned · ` +
      `${toInsert.length} comments ${DRY ? 'would be added' : 'added'} · ` +
      `${skippedHasThread} already had a thread · ${skippedNoFollowers} had no followers`,
  )
  if (DRY) console.log('  dry run — no writes')
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
