import { useQuery } from '@tanstack/react-query'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { FlatList, View } from 'react-native'

import { FollowPill, PersonRow } from '@/components/PersonRow'
import { Button, EmptyState, ErrorState, RowsSkeleton, Segmented } from '@/components/ui'
import { toast } from '@/components/ui/toast-store'
import { ApiError, api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { shareInviteLink } from '@/lib/shareProfile'
import type { FollowUser } from '@/lib/types'

// A member's followers or following list — the destination the profile
// stats trio (Seguidores / Siguiendo) and a member's own passport point to.
// Neither existed before M2: the counts were plain, untappable text, so a
// member could see they had 14 followers and never find out who.
type Tab = 'followers' | 'following'

export default function PeopleScreen() {
  const t = useT()
  const { userId, tab: tabParam } = useLocalSearchParams<{ userId: string; tab?: string }>()
  const [tab, setTab] = useState<Tab>(tabParam === 'following' ? 'following' : 'followers')

  const q = useQuery({
    queryKey: ['follow-list', userId, tab],
    queryFn: () => api.get<{ users: FollowUser[] }>(`/social/${tab}?userId=${userId}`),
  })

  const inviteFriends = async () => {
    try {
      const { code } = await api.get<{ code: string }>('/invites/me')
      await shareInviteLink(code)
    } catch {
      toast({ variant: 'error', message: t('people.invite_link_error') })
    }
  }

  const gone = q.error instanceof ApiError && q.error.status === 404

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          title: tab === 'followers' ? t('people.followers_title') : t('people.following_title'),
          headerLargeTitle: false,
        }}
      />
      <View className="px-5 pt-3 pb-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'followers', label: t('people.followers_title') },
            { value: 'following', label: t('people.following_title') },
          ]}
        />
      </View>

      {q.isPending ? (
        <RowsSkeleton />
      ) : q.isError ? (
        gone ? (
          <EmptyState>{t('people.not_available')}</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>{t('people.load_error')}</ErrorState>
        )
      ) : (
        <FlatList
          data={q.data?.users ?? []}
          keyExtractor={(u) => u.id}
          renderItem={({ item, index }) => {
            // A virtualized list can't wrap its rows in one View, so each row
            // carries its slice of the grouped white card: side borders always,
            // top edge + rounding on the first, bottom edge + rounding on the last.
            const last = index === (q.data?.users.length ?? 0) - 1
            return (
              <View
                className={`border-line border-x bg-surface px-3 ${index === 0 ? 'rounded-t-card border-t' : ''} ${last ? 'rounded-b-card border-b' : ''}`}
              >
                <PersonRow
                  user={item}
                  last={last}
                  right={
                    <FollowPill userId={item.id} initial={item.isFollowing} from="people_screen" />
                  }
                />
              </View>
            )
          }}
          contentContainerClassName="px-5 pb-10"
          ListEmptyComponent={
            <EmptyState
              body={
                tab === 'followers'
                  ? t('people.followers_empty_body')
                  : t('people.following_empty_body')
              }
              action={
                tab === 'followers' ? (
                  <Button size="sm" variant="secondary" onPress={inviteFriends}>
                    {t('people.invite_friends')}
                  </Button>
                ) : undefined
              }
            >
              {t('people.empty_title')}
            </EmptyState>
          }
        />
      )}
    </View>
  )
}
