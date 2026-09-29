import type { useRouter } from 'expo-router'

import { showSheet } from '@/components/ui/Sheet'
import type { useT } from '@/lib/i18n'
import { removeRankingWithUndo } from '@/lib/rankingRemoval'
import type { Ranking } from '@/lib/types'

// The actions on one of your rankings — the "···" menu on a row, and a long press on a podium
// tile. Edit note is offered only where there is somewhere to edit it (the rows edit inline).
export async function openRankingActions(
  ranking: Ranking,
  t: ReturnType<typeof useT>,
  router: ReturnType<typeof useRouter>,
  onEditNote?: () => void,
) {
  const actions: { label: string; destructive?: boolean; run: () => void }[] = []
  if (onEditNote) {
    actions.push({
      label: ranking.note ? t('rankings.edit_note') : t('rankings.add_note'),
      run: onEditNote,
    })
  }
  actions.push(
    {
      label: t('restaurant.rank_again_label'),
      run: () => router.push(`/rank?restaurant=${ranking.restaurant.id}`),
    },
    { label: t('rankings.remove'), destructive: true, run: () => removeRankingWithUndo(ranking) },
  )
  const i = await showSheet({
    title: ranking.restaurant.name,
    options: actions.map((a) => ({ label: a.label, destructive: a.destructive })),
  })
  if (i != null) actions[i]?.run()
}
