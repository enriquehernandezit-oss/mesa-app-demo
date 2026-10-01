// Merge the duplicate places Google confirmed (2026-09-30, plus the one the founder confirmed on
// 2026-10-01) in one command, skipping any that are not in the database you point it at —
// production may not match your local copy, or a group may already be merged.
//
//   DATABASE_URL="<url>" bun run places:merge-known --dry-run
//   DATABASE_URL="<url>" bun run places:merge-known
//
// Each group is its own transaction, run through the same mergeGroup as `places:merge`, so
// --dry-run rolls each one back and prints exactly what the real run would do. A group that does
// not exist here is reported as skipped and the run goes on; anything WRONG (two different Google
// ids in one group) stops the run, with the groups before it already merged. See docs/PLACES.md,
// "Merging duplicates", for which row is kept and what comes across.
import { pool } from '@mesa/db'

import { databaseLabel } from './lib/databaseLabel'
import { mergeGroup } from './places-merge'

// Ichiban and Shibuya are both Shibuya Ichiban (Google's name for it); the others are a seed row
// and its catalog twin, named the same or almost.
export const KNOWN_DUPLICATES: { names: string[]; rename?: string }[] = [
  { names: ["Buche' Perico", 'Buche Perico'] },
  { names: ['Ichiban', 'Shibuya', 'Shibuya Ichiban'], rename: 'Shibuya Ichiban' },
  { names: ['Il Bacareto'] },
  { names: ['Laurel'] },
  { names: ['LILA - Modern Cuisine'] },
  { names: ['Restaurante Gijón', 'Restaurante Gijon'] },
  // Not a Google finding: the seed's bare "SBG" (no address, no Google id, ~100 m from Sophia's pin)
  // is Sophia's Bar & Grill, which Google names "SBG Sophia's Bar & Grill". The founder confirmed it.
  // The other SBG venues (Café SBG, SBG Kitchen, Atrium, Punta Cana, Casa de Campo) are different
  // places and stay separate.
  { names: ['SBG', "Sophia's Bar & Grill"] },
]

async function main() {
  console.log(`Database: ${databaseLabel(process.env.DATABASE_URL)}`)
  const dryRun = process.argv.includes('--dry-run')
  let done = 0
  let skipped = 0
  for (const group of KNOWN_DUPLICATES) {
    console.log(`\n━━ ${group.names.join(' + ')} ━━`)
    const result = await mergeGroup(group.names, { rename: group.rename, dryRun })
    if (result.kind === 'skipped') {
      skipped++
      console.log(`skipped — ${result.reason}`)
    } else {
      done++
    }
  }
  console.log(
    `\n${dryRun ? '(DRY RUN) ' : ''}${done} group(s) ${dryRun ? 'would be merged' : 'merged'}, ` +
      `${skipped} skipped (not in this database, or already merged).`,
  )
}

if (import.meta.main) {
  main()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
