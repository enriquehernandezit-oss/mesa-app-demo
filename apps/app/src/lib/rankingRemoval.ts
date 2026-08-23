// Optimistic "remove ranking" with an undo window — a plain module (not a
// hook) so the pending delete and its undo survive RankingRow unmounting the
// instant the row is optimistically removed. Imports the queryClient
// singleton (lib/query.ts) directly, same reason.
import { toast } from '../components/ui/toast-store'
import { api } from './api'
import { scoreForPosition } from './display'
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

function invalidateAfterRemoval(restaurantId: string) {
  queryClient.invalidateQueries({ queryKey: ['rankings'] })
  queryClient.invalidateQueries({ queryKey: ['feed'] })
  queryClient.invalidateQueries({ queryKey: ['me-stats'] })
  queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] })
}

export function removeRankingWithUndo(ranking: Ranking): void {
  if (pending.has(ranking.id)) return
  const cur = queryClient.getQueryData<Cache>(KEY)
  if (!cur) return
  const originalIndex = cur.rankings.findIndex((r) => r.id === ranking.id)
  if (originalIndex === -1) return
  pending.add(ranking.id)

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
          message: 'No se pudo quitar de tu lista',
          action: {
            label: 'Intentar de nuevo',
            onClick: () => removeRankingWithUndo(ranking),
          },
        })
      })
  }

  toast({
    message: `Quité ${ranking.restaurant.name} de tu lista`,
    duration: UNDO_MS,
    onAutoClose: commit,
    action: {
      label: 'Deshacer',
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
