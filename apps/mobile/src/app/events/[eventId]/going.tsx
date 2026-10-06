import { useQuery } from '@tanstack/react-query'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { ScrollView, Text, View } from 'react-native'

import { PersonRow } from '@/components/PersonRow'
import { ScreenHeader } from '@/components/ScreenHeader'
import { EmptyState, ErrorState, RowsSkeleton, MAX_SCALE } from '@/components/ui'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'

// "Friends going" — every person you follow who is going to an event, most recent sign-up
// first. Reached from the event's "Who's going" row and its "32 friends going" line. Each
// row opens that person; there is nothing to follow here, you already do.
export default function EventGoingScreen() {
  const t = useT()
  const router = useRouter()
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/events/${eventId}`))

  const q = useQuery({
    queryKey: ['event', eventId, 'going'],
    queryFn: () =>
      api.get<{
        friends: { id: string; name: string; handle: string | null; image: string | null }[]
      }>(`/events/${eventId}/going`),
    enabled: Boolean(eventId),
  })
  const friends = q.data?.friends ?? []

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: t('events.friends_going_title'), headerLargeTitle: false }} />
      <ScreenHeader onBack={goBack} backLabel={t('common.back_plain')} />
      <View className="px-5">
        <Text maxFontSizeMultiplier={MAX_SCALE} className="font-serif text-title text-text">
          {t('events.friends_going_title')}
        </Text>
        {friends.length > 0 ? (
          <Text
            maxFontSizeMultiplier={MAX_SCALE}
            className="mt-1 font-ui text-label text-text-muted"
          >
            {t('events.friends_going_count', { n: friends.length })}
          </Text>
        ) : null}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-10 pt-2">
        {q.isPending ? (
          <RowsSkeleton rows={6} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('events.going_list_error')}</ErrorState>
        ) : friends.length === 0 ? (
          <EmptyState>{t('events.going_list_empty')}</EmptyState>
        ) : (
          friends.map((f, i) => <PersonRow key={f.id} user={f} last={i === friends.length - 1} />)
        )}
      </ScrollView>
    </View>
  )
}
