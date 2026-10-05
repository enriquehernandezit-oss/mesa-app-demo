import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useRouter } from 'expo-router'
import { memo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { MentionField } from '@/components/MentionField'
import { MAX_SCALE } from '@/components/ui'
import { MoreIcon } from '@/components/ui/icons'
import { ScoreStack } from '@/components/ui/patterns'
import { PlaceLine } from '@/components/ui/PlaceLine'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { tagLabel } from '@/lib/display'
import { tapLight } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { removeRankingWithUndo } from '@/lib/rankingRemoval'
import type { Ranking } from '@/lib/types'
import { DATA_FIGURES } from '@/theme/vars'

import { openRankingActions } from './rankingActions'
import { SwipeToRemove } from './SwipeToRemove'

// One place on Your list, from #4 down (the top three are the podium): its position, its
// picture, its name over "cuisine · neighborhood · $$" — and what you ordered there (else your
// first occasion) in the accent — and its score as a stack at the right. A flat row with a
// hairline under it. "···" opens the actions (note, rank again, remove); a left swipe removes.
export const RankRow = memo(function RankRow({
  ranking,
  skipAnim,
  wide,
}: {
  ranking: Ranking
  skipAnim?: boolean
  // Three-digit positions: give the number column room.
  wide?: boolean
}) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(ranking.note ?? '')

  const saveNote = useMutation({
    mutationFn: () => api.patch(`/rankings/${ranking.id}/note`, { body: draft.trim() }),
    onSuccess: () => {
      tapLight()
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['rankings'] })
      // The same note is on the feed card, the place page's friends list and the profile.
      for (const key of ['feed', 'restaurant', 'user-rankings']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
    onError: () =>
      toast({
        variant: 'error',
        message: t('rankings.note_save_error'),
        action: { label: t('common.retry'), onClick: () => saveNote.mutate() },
      }),
  })

  const accentLine = ranking.favoriteDish
    ? t('rankings.order_this', { dish: ranking.favoriteDish })
    : ranking.tags?.[0]
      ? tagLabel(ranking.tags[0])
      : null

  return (
    <SwipeToRemove onRemove={() => removeRankingWithUndo(ranking)} skipAnim={skipAnim}>
      {/* bg-bg: the row must be opaque, or the swipe's red action shows through it. */}
      <View className="border-b border-line bg-bg py-[9px]">
        <View className="flex-row items-center gap-3">
          <Text
            style={[DATA_FIGURES, { width: wide ? 38 : 26 }]}
            maxFontSizeMultiplier={1.1}
            className="text-center font-serif text-serif-md text-text-muted"
          >
            {ranking.position}
          </Text>
          <Link href={`/r/${ranking.restaurant.id}`} asChild>
            <Pressable
              accessibilityRole="button"
              className="min-w-0 flex-1 active:opacity-80"
              accessibilityLabel={`${ranking.restaurant.name}, ${ranking.position}`}
            >
              <PlaceLine
                name={ranking.restaurant.name}
                coverImageId={ranking.restaurant.coverImageId}
                cuisine={ranking.restaurant.cuisine}
                neighborhood={ranking.neighborhood}
                priceTier={ranking.restaurant.priceTier}
                note={accentLine}
                picture={50}
                right={<ScoreStack score={ranking.score} />}
              />
            </Pressable>
          </Link>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('rankings.more_actions')}
            onPress={() => openRankingActions(ranking, t, router, () => setEditing(true))}
            hitSlop={8}
            className="h-11 w-6 items-center justify-center active:opacity-60"
          >
            <MoreIcon size={18} color="text-faint" />
          </Pressable>
        </View>
        {editing ? (
          <View className="mt-2 gap-1 pl-9">
            <MentionField
              autoFocus
              multilineBox
              placeholder={t('rankings.note_placeholder')}
              maxLength={140}
              value={draft}
              onValue={setDraft}
            />
            <View className="flex-row gap-5">
              <NoteAction disabled={saveNote.isPending} onPress={() => saveNote.mutate()}>
                {t('rankings.save')}
              </NoteAction>
              <NoteAction
                muted
                onPress={() => {
                  setDraft(ranking.note ?? '')
                  setEditing(false)
                }}
              >
                {t('common.cancel')}
              </NoteAction>
            </View>
          </View>
        ) : null}
      </View>
    </SwipeToRemove>
  )
})

function NoteAction({
  children,
  onPress,
  disabled,
  muted,
}: {
  children: string
  onPress: () => void
  disabled?: boolean
  muted?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className="min-h-[44px] justify-center active:opacity-60"
    >
      <Text
        maxFontSizeMultiplier={MAX_SCALE}
        className={`font-ui-semibold text-subhead ${muted ? 'text-text-muted' : 'text-accent'}`}
      >
        {children}
      </Text>
    </Pressable>
  )
}
