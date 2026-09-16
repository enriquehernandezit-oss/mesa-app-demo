import { FollowPill, PersonRow } from '@/components/PersonRow'
import { Body, Button, Caption, ErrorState, RowsSkeleton, Title } from '@/components/ui'
import { ShareIcon } from '@/components/ui/icons'
import { useInviteLink } from '@/hooks/useInviteLink'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import type { SuggestedUser } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { Pressable, ScrollView, Text, View } from 'react-native'

// Find friends v1 (M12.5) — a real destination "Descubre gente" now routes
// to, instead of the restaurant browser it used to. An invite-link card plus
// the existing GET /onboarding/suggested-friends list (most-followed-first);
// contacts, mutuals-of-friends and taste-based reasons land in M18.
export default function AmigosScreen() {
  const t = useT()
  const invite = useInviteLink()
  const suggested = useQuery({
    queryKey: ['people'],
    queryFn: () => api.get<{ users: SuggestedUser[] }>('/onboarding/suggested-friends'),
  })
  const users = suggested.data?.users ?? []

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerClassName="px-5 pb-10"
      contentInsetAdjustmentBehavior="automatic"
    >
      <Pressable
        accessibilityRole="button"
        onPress={invite.share}
        disabled={invite.sharing}
        className="mt-4 flex-row items-center gap-3 rounded border border-line bg-surface p-4 active:opacity-80"
      >
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-accent-fill">
          <ShareIcon size={18} color="on-accent" />
        </View>
        <View className="flex-1">
          <Text className="font-ui-semibold text-body text-text">{t('amigos.invite_title')}</Text>
          <Caption className="mt-0.5">
            {invite.joined > 0
              ? t('settings.joined_count', { n: invite.joined })
              : t('amigos.invite_body')}
          </Caption>
        </View>
      </Pressable>

      <Title className="mt-6 mb-1">{t('amigos.suggestions_title')}</Title>
      {suggested.isPending ? (
        <RowsSkeleton rows={5} thumb={36} />
      ) : suggested.isError ? (
        <ErrorState onRetry={() => suggested.refetch()}>{t('amigos.load_error')}</ErrorState>
      ) : users.length === 0 ? (
        <Body>{t('amigos.no_suggestions')}</Body>
      ) : (
        users.map((u) => (
          <PersonRow
            key={u.id}
            user={u}
            subtitle={[t('settings.ranked_count', { n: u.rankedCount ?? 0 }), u.neighborhood]
              .filter(Boolean)
              .join(' · ')}
            right={<FollowPill userId={u.id} initial={false} from="find_friends" />}
          />
        ))
      )}
    </ScrollView>
  )
}
