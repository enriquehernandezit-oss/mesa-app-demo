// Finding and removing the fictional members the world seed (`bun db:seed`) invented, so a database
// that real people are about to use holds only real people.
//
// What marks a seeded member, and only a seeded member: no email, no sign-in account of any kind, no
// session, no phone. Everyone who ever signed up has an email (a phone sign-up gets a placeholder one,
// Apple a relay one) AND an `account` row, so nobody real can match. The demo account has an email and
// a password, so it never matches either.
//
// Deleting the user row is the whole job: every table that points at a member cascades (rankings,
// dishes, notes, comments, follows, saves, notifications…), except `restaurants.created_by`, which
// becomes null. Other members' own rankings are untouched, so no list needs rewriting.
import { schema } from '@mesa/db'
import { and, inArray, isNull, sql } from 'drizzle-orm'

import type { Executor } from './rankingOrder'

const { user } = schema

export interface SeedMember {
  id: string
  handle: string | null
  name: string | null
  ranked: number
}

export interface PurgeReport {
  members: SeedMember[]
  // What goes with them, by table.
  removed: Record<string, number>
}

// `onlyIds` narrows the search to those ids — the test's way of staying clear of the seed's own rows.
export async function findSeedMembers(exec: Executor, onlyIds?: string[]): Promise<SeedMember[]> {
  const rows = await exec
    .select({
      id: user.id,
      handle: user.handle,
      name: user.name,
      // Written out with table names: drizzle drops the table qualifier from a column inside a plain
      // sql`` fragment, and the unqualified `id` would then bind to the inner table.
      ranked: sql<number>`(select count(*)::int from rankings r where r.user_id = "user"."id")`,
    })
    .from(user)
    .where(
      and(
        isNull(user.email),
        isNull(user.phoneNumber),
        isNull(user.phoneHash),
        sql`not exists (select 1 from account a where a.user_id = "user"."id")`,
        sql`not exists (select 1 from session s where s.user_id = "user"."id")`,
        onlyIds ? inArray(user.id, onlyIds) : undefined,
      ),
    )
  return rows.sort((a, b) => (a.handle ?? a.id).localeCompare(b.handle ?? b.id))
}

async function countFor(exec: Executor, ids: string[], query: (list: string) => string) {
  if (ids.length === 0) return 0
  const list = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',')
  const res = await exec.execute(sql.raw(query(list)))
  const row = (res.rows as { n: number | string }[])[0]
  return Number(row?.n ?? 0)
}

// Counts what the delete will take with it, then deletes. `expect` is the number the operator read off
// the dry run: a different match count means the database is not the one they looked at, so nothing
// is deleted.
export async function purgeSeedMembers(
  exec: Executor,
  opts: { expect: number; onlyIds?: string[] },
): Promise<PurgeReport> {
  const members = await findSeedMembers(exec, opts.onlyIds)
  if (members.length !== opts.expect) {
    throw new Error(
      `Found ${members.length} seeded member(s) but --expect said ${opts.expect}. Nothing was changed; ` +
        'run with --dry-run and check the list.',
    )
  }
  const ids = members.map((m) => m.id)
  const count = (table: string, column: string) =>
    countFor(exec, ids, (l) => `select count(*) as n from ${table} where ${column} in (${l})`)
  const removed: Record<string, number> = {
    rankings: await count('rankings', 'user_id'),
    dishes: await count('dishes', 'user_id'),
    'vibe notes': await count('vibe_notes', 'user_id'),
    comments: await count('ranking_comments', 'user_id'),
    follows: await countFor(
      exec,
      ids,
      (l) =>
        `select count(*) as n from follows where follower_id in (${l}) or following_id in (${l})`,
    ),
    'saved places': await count('saved_places', 'user_id'),
  }
  if (ids.length > 0) await exec.delete(user).where(inArray(user.id, ids))
  return { members, removed }
}
