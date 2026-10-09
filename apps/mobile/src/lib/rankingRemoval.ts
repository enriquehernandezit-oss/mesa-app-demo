// Optimistic "remove ranking" with an undo window — a plain module (not a
// hook) so the pending delete and its undo survive RankingRow unmounting the
// instant the row is optimistically removed. Imports the queryClient
// singleton (lib/query.ts) directly, same reason.
import { Alert } from 'react-native'

import { toast } from '../components/ui/toast-store'
import { api } from './api'
import { scoreForPosition } from './display'
import { tapLight } from './haptics'
import { getLanguage, t } from './i18n'
import { invalidateAfterRanking } from './invalidateAfterRanking'
import { queryClient } from './query'
import type { Ranking } from './types'

type Cache = { rankings: Ranking[] }
const KEY = ['rankings'] as const
const UNDO_MS = 5000

// Double-tap / already-pending guard, keyed by ranking id.
const pending = new Set<string>()

// Re-densify positions AND scores after the list's membership changes — the
// server does the same on DELETE (see routes/rankings.ts's `rewrite`), so the
// optimistic list must match or scores read stale for the whole undo window.
function renumber(rs: Ranking[]): Ranking[] {
  const total = rs.length
  return rs.map((r, i) => ({
    ...r,
    position: i + 1,
    score: scoreForPosition(i, total),
  }))
}

// A superset of what this needs (invalidateAfterRanking also covers ['saved'],
// ['explore'], ['map'], ['lists'], ['leaderboard'], ['trending'],
// ['user-rankings']) — a removal changes the same surfaces an addition does,
// so sharing one list here is a correctness fix, not just deduplication.
const invalidateAfterRemoval = invalidateAfterRanking

// Removing a ranking also deletes the dishes and photos posted on it (and the likes and saves on
// them), so a ranking that has dishes asks first. The undo toast still covers a plain removal.
export function removeRankingWithUndo(ranking: Ranking): void {
  const n = ranking.dishCount ?? 0
  if (n === 0 || pending.has(ranking.id)) {
    startRemoval(ranking)
    return
  }
  const lang = getLanguage()
  Alert.alert(
    t(lang, 'rankings.remove_dishes_title', { name: ranking.restaurant.name }),
    t(lang, 'rankings.remove_dishes_body', { n }),
    [
      { text: t(lang, 'common.cancel'), style: 'cancel' },
      {
        text: t(lang, 'rankings.remove'),
        style: 'destructive',
        onPress: () => startRemoval(ranking),
      },
    ],
  )
}

function startRemoval(ranking: Ranking): void {
  if (pending.has(ranking.id)) return
  const cur = queryClient.getQueryData<Cache>(KEY)
  if (!cur) return
  const originalIndex = cur.rankings.findIndex((r) => r.id === ranking.id)
  if (originalIndex === -1) return
  pending.add(ranking.id)
  tapLight()

  queryClient.setQueryData<Cache>(KEY, {
    rankings: renumber(cur.rankings.filter((r) => r.id !== ranking.id)),
  })

  // Fires only if the undo window elapses on its own — the toast's own timer
  // is the single source of truth (and it already pauses while the tab is
  // hidden), so there's no second, uncoordinated timer to keep in sync.
  const commit = () => {
    pending.delete(ranking.id)
    api
      .del(`/rankings/${ranking.id}`)
      .then(() => invalidateAfterRemoval(ranking.restaurant.id))
      .catch(() => {
        // The server never deleted it — refetch restores the true list rather
        // than trying to hand-patch the cache back.
        queryClient.invalidateQueries({ queryKey: KEY })
        toast({
          variant: 'error',
          message: t(getLanguage(), 'rankings.remove_error'),
          action: {
            label: t(getLanguage(), 'common.retry'),
            onClick: () => startRemoval(ranking),
          },
        })
      })
  }

  toast({
    message: t(getLanguage(), 'rankings.removed_toast', { name: ranking.restaurant.name }),
    duration: UNDO_MS,
    onAutoClose: commit,
    action: {
      label: t(getLanguage(), 'rankings.undo'),
      onClick: () => {
        pending.delete(ranking.id)
        const live = queryClient.getQueryData<Cache>(KEY)
        const list = live?.rankings ?? []
        const idx = Math.min(originalIndex, list.length)
        const restored = [...list]
        restored.splice(idx, 0, ranking) // the exact object: note/dish/tags intact
        queryClient.setQueryData<Cache>(KEY, { rankings: renumber(restored) })
      },
    },
  })
}
