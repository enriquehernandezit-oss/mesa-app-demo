// Read-only ranking-integrity check. Asserts the invariants a correct ranked
// list must hold and reports any user that violates one, with no writes.
//
//   DATABASE_URL="<url>" bun run rankings:check
//
// Run this against production (with the founder's own DATABASE_URL) after
// every renormalize, and any time the ranking/onboarding routes change.
import { pool } from '@mesa/db'

const SAMPLE = 10

interface CheckResult {
  name: string
  ok: boolean
  detail: string
  offenders: string[]
}

function toResult(name: string, rows: { user_id: string }[]): CheckResult {
  const offenders = rows.map((r) => r.user_id)
  return {
    name,
    ok: offenders.length === 0,
    detail: offenders.length === 0 ? 'ok' : `${offenders.length} user(s) affected`,
    offenders: offenders.slice(0, SAMPLE),
  }
}

async function run(): Promise<void> {
  const results: CheckResult[] = []

  // Each check below selects the DISTINCT offending user_ids in a subquery
  // and only limits the deduplicated set — limiting the raw offending ROWS
  // instead would undercount badly whenever a handful of users each have
  // many bad rows (e.g. one bulk-seeded user monopolizing the first 10 rows
  // while dozens of other affected users never appear in the sample).

  // I1 — positions per user are 1..N with no gaps or duplicates.
  {
    const rows = await pool.query<{ user_id: string }>(`
      with agg as (
        select user_id, count(*)::int n, array_agg(position order by position) arr
        from rankings group by user_id
      )
      select distinct user_id from agg
      where arr <> (select array_agg(g) from generate_series(1, n) g)
    `)
    results.push(toResult('I1 positions are 1..N contiguous per user', rows.rows))
  }

  // I2 — no duplicate (user, restaurant). Should be impossible given the
  // schema's unique(userId, restaurantId), but cheap to confirm directly.
  {
    const rows = await pool.query<{ user_id: string }>(`
      select distinct user_id from rankings group by user_id, restaurant_id
      having count(*) > 1
    `)
    results.push(toResult('I2 no duplicate (user, restaurant)', rows.rows))
  }

  // I3 — no duplicate (user, position).
  {
    const rows = await pool.query<{ user_id: string }>(`
      select distinct user_id from rankings group by user_id, position
      having count(*) > 1
    `)
    results.push(toResult('I3 no duplicate (user, position)', rows.rows))
  }

  // I4 — score is non-increasing as position increases, per user.
  {
    const rows = await pool.query<{ user_id: string }>(`
      select distinct user_id from (
        select user_id, score, lag(score) over (partition by user_id order by position) prev
        from rankings
      ) w where prev is not null and score > prev
    `)
    results.push(toResult('I4 score is non-increasing with position', rows.rows))
  }

  // I5 — score matches the ONE formula (scoreFor: 96 at top, 72 at bottom,
  // 95 for a list of one), computed in SQL against each user's own list size.
  {
    const rows = await pool.query<{ user_id: string }>(`
      with sized as (
        select r.user_id, r.position, r.score, c.n
        from rankings r
        join (select user_id, count(*)::int n from rankings group by user_id) c
          using (user_id)
      )
      select distinct user_id from sized
      where abs(score - (
        case when n <= 1 then 95
        else round(96 - (position - 1)::numeric * 24 / (n - 1))
        end
      )) > 0.001
    `)
    results.push(toResult('I5 score matches scoreFor(position-1, n)', rows.rows))
  }

  console.log(`\nranking integrity check\n${'='.repeat(40)}`)
  let allOk = true
  for (const r of results) {
    if (!r.ok) allOk = false
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} — ${r.detail}`)
    if (!r.ok) console.log(`      offending user_id sample: ${r.offenders.join(', ')}`)
  }
  console.log('='.repeat(40))
  console.log(allOk ? 'all invariants hold.' : 'invariants violated — run rankings:renormalize.')

  await pool.end()
  if (!allOk) process.exit(1)
}

if (import.meta.main) {
  run().catch(async (err) => {
    console.error(err)
    await pool.end()
    process.exit(1)
  })
}
