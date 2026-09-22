// Delete one member and everything of theirs, by email — the same hard delete
// the in-app "Eliminar cuenta" performs (routes/me.ts), but runnable against a
// database from a laptop. Written for one job: removing the seeded `demo@mesa.test`
// account from production before outsiders get a TestFlight build, since its
// password has been shared in plain text.
//
//   bun run user:delete demo@mesa.test --dry-run
//   DATABASE_URL="<url>" bun run user:delete demo@mesa.test
//
// Matches ONE exact email (case-insensitive) and refuses anything else — there is
// no pattern mode on purpose. Every row that references the user cascades (see
// packages/db/src/schema.ts's `user` table), so this takes their rankings, notes,
// comments, saves, RSVPs, follows and push tokens with it. It cannot be undone.
import { db, pool, schema } from '@mesa/db'
import { eq, sql } from 'drizzle-orm'

const { user, rankings, vibeNotes, rankingComments } = schema

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const email = args.find((a) => !a.startsWith('--'))?.trim()
  if (!email) {
    console.error('usage: bun run user:delete "<email>" [--dry-run]')
    process.exit(1)
  }

  const matches = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      ranked: sql<number>`(select count(*)::int from ${rankings} where ${rankings.userId} = ${user.id})`,
      notes: sql<number>`(select count(*)::int from ${vibeNotes} where ${vibeNotes.userId} = ${user.id})`,
      comments: sql<number>`(select count(*)::int from ${rankingComments} where ${rankingComments.userId} = ${user.id})`,
    })
    .from(user)
    .where(sql`lower(${user.email}) = lower(${email})`)

  if (matches.length !== 1) {
    console.error(
      matches.length === 0
        ? `No account with the email "${email}".`
        : `${matches.length} accounts share that email — refusing to guess.`,
    )
    process.exit(1)
  }

  const u = matches[0] as (typeof matches)[number]
  console.log(
    `${dryRun ? '(DRY RUN) would ' : ''}delete ${u.email} (${u.name ?? 'no name'}, ${u.id}) — ` +
      `${u.ranked} ranking(s), ${u.notes} note(s), ${u.comments} comment(s) go with it.`,
  )
  if (dryRun) return

  await db.delete(user).where(eq(user.id, u.id))
  console.log('done: deleted.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
