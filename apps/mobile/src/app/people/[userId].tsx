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
//
// "Mutual" is the third tab on someone else's profile: which of the people I follow or who follow
// me also follow them — the list behind "Followed by Ana and 3 more". It is only offered when
// there is someone in it (or when that is where the link pointed).
type Tab = 'followers' | 'following' | 'mutual'

export default function PeopleScreen() {
  const t = useT()
  const { userId, tab: tabParam } = useLocalSearchParams<{ userId: string; tab?: string }>()
  const [tab, setTab] = useState<Tab>(
    tabParam === 'following' ? 'following' : tabParam === 'mutual' ? 'mutual' : 'followers',
  )

  const q = useQuery({
    queryKey: ['follow-list', userId, tab],
    queryFn: () =>
      api.get<{ users: FollowUser[]; locked?: boolean }>(`/social/${tab}?userId=${userId}`),
  })
  // Whether to offer the Mutual tab at all: fetched once, so the tab appears (or not) before it
  // is tapped. On your own list, and when nobody is in common, it stays out of the way.
  const mutualPeek = useQuery({
    queryKey: ['follow-list', userId, 'mutual'],
    queryFn: () => api.get<{ users: FollowUser[] }>(`/social/mutuals?userId=${userId}`),
  })
  const showMutual = tab === 'mutual' || (mutualPeek.data?.users.length ?? 0) > 0

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
          title:
            tab === 'followers'
              ? t('people.followers_title')
              : tab === 'mutual'
                ? t('people.mutual_title')
                : t('people.following_title'),
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
            ...(showMutual ? [{ value: 'mutual' as const, label: t('people.mutual_title') }] : []),
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
      ) : q.data?.locked ? (
        // A private account you don't follow: its counts show on the profile, its lists don't.
        <EmptyState body={t('people.locked_body')}>{t('people.locked_title')}</EmptyState>
      ) : (
        <FlatList
          data={q.data?.users ?? []}
          keyExtractor={(u) => u.id}
          renderItem={({ item, index }) => {
            // A virtualized list can't wrap its rows in one View, so each row
            // carries its slice of the grouped white card: rounded at the first row's top and the
            // last row's bottom (no lift — a shadow per slice would show the seams).
            const last = index === (q.data?.users.length ?? 0) - 1
            return (
              <View
                className={`bg-surface px-4 ${index === 0 ? 'rounded-t-group' : ''} ${last ? 'rounded-b-group' : ''}`}
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
          contentContainerClassName="px-4 pb-10"
          ListEmptyComponent={
            <EmptyState
              body={
                tab === 'followers'
                  ? t('people.followers_empty_body')
                  : tab === 'mutual'
                    ? t('people.mutual_empty_body')
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
