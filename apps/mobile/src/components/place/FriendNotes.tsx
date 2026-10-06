import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { MentionText } from '@/components/MentionText'
import { pickReportReason } from '@/components/ReportControl'
import { Body, MAX_SCALE, SectionHeader } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { MoreIcon } from '@/components/ui/icons'
import { ScoreStack } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { FriendRanking } from '@/lib/types'

// What the people you follow said about this place: their photo, name, the note as a serif
// quote, and their score as a stack at the right — hairlines between, not cards. Three at a
// time with an expander. The "···" on a row that has a note (and the long-press) opens the
// report sheet: App Store 1.2 wants reporting reachable wherever UGC renders.
export function FriendNotes({ rankings }: { rankings: FriendRanking[] }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? rankings : rankings.slice(0, 3)
  return (
    <View className="px-5">
      <SectionHeader
        action={
          rankings.length > 0 ? (
            <Text
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-medium text-pill text-text-muted"
            >
              {t('place.n_ranked_it', { n: rankings.length })}
            </Text>
          ) : undefined
        }
      >
        {t('place.friends_title')}
      </SectionHeader>
      {rankings.length === 0 ? (
        <Body className="text-text-muted">{t('restaurant.no_friend_scores')}</Body>
      ) : (
        <>
          {shown.map((fr, i) => (
            <NoteRow key={fr.user.id} fr={fr} first={i === 0} />
          ))}
          {rankings.length > 3 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setExpanded((v) => !v)}
              className="min-h-[44px] justify-center active:opacity-60"
            >
              <Text
                maxFontSizeMultiplier={MAX_SCALE}
                className="font-ui-semibold text-pill text-accent"
              >
                {expanded
                  ? t('restaurant.show_less')
                  : t('restaurant.view_all_rankings', { n: rankings.length })}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  )
}

function NoteRow({ fr, first }: { fr: FriendRanking; first: boolean }) {
  const t = useT()
  const router = useRouter()
  const report = useMutation({
    mutationFn: ({ reason, noteId }: { reason: string; noteId: string }) =>
      api.post('/moderation/reports', { targetType: 'vibe_note', targetId: noteId, reason }),
    onSuccess: () => toast({ message: t('common.reported') }),
    onError: () => toast({ variant: 'error', message: t('common.report_error') }),
  })
  const noteId = fr.noteId
  const onReport =
    fr.note && noteId
      ? async () => {
          const reason = await pickReportReason('vibe_note')
          if (reason) report.mutate({ reason, noteId })
        }
      : undefined
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/u/${fr.user.id}`)}
      onLongPress={onReport}
      className={`flex-row gap-3 py-[11px] active:opacity-80 ${first ? '' : 'border-line border-t'}`}
    >
      <Avatar name={fr.user.name || fr.user.handle || 'm'} src={fr.user.image} size={36} />
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_SCALE}
          className="font-ui-semibold text-subhead text-text"
        >
          {fr.user.name || fr.user.handle}
        </Text>
        {fr.note ? (
          <Text
            selectable
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-0.5 font-serif text-serif-sm text-text"
          >
            “<MentionText text={fr.note} />”
          </Text>
        ) : null}
      </View>
      <ScoreStack score={fr.score} size="sm" />
      {onReport ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('report.note_a11y')}
          onPress={onReport}
          hitSlop={8}
          className="-mr-1 w-6 items-center justify-center active:opacity-60"
        >
          <MoreIcon size={18} color="text-faint" />
        </Pressable>
      ) : null}
    </Pressable>
  )
}
