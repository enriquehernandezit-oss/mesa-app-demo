import { readFileSync } from 'node:fs'
import { guessDishCategory } from './dishCategories'

// Read-only sanity check for the dish-category keyword matcher (M13) — runs
// it over every real menu item name in the Top 100 catalog and reports the
// `otro` fallback rate, since that's the actual calibration signal: a
// taxonomy that tests clean on hand-picked fixtures can still miss a huge
// share of real menu vocabulary. `bun run dishes:audit`.
const DATA_PATH = new URL('../../../apps/api/data/top100.json', import.meta.url).pathname

interface Top100MenuItem {
  name: string
}
interface Top100Data {
  menus: Record<string, Top100MenuItem[]>
}

const data: Top100Data = JSON.parse(readFileSync(DATA_PATH, 'utf8'))

let total = 0
const otroNames: string[] = []
const byCategory = new Map<string, number>()

for (const restName in data.menus) {
  for (const item of data.menus[restName] ?? []) {
    total++
    const cat = guessDishCategory(item.name)
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1)
    if (cat === 'otro') otroNames.push(item.name)
  }
}

const otroRate = total ? (100 * otroNames.length) / total : 0
console.log(`dishes:audit — ${total} real menu items`)
console.log(
  `  otro: ${otroNames.length} (${otroRate.toFixed(1)}%) — target is under 10% (≥90% categorized)`,
)
console.log('  by category:')
for (const [cat, n] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${cat}: ${n}`)
}
if (otroNames.length) {
  console.log(`  ${otroNames.length} name(s) landing in otro:`)
  for (const name of otroNames.sort()) console.log(`    ${name}`)
}
