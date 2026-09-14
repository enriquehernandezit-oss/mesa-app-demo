import { FollowPill, PersonRow } from '@/components/PersonRow'
import { Button, Chip, EmptyState, ErrorState, RowsSkeleton } from '@/components/ui'
import { toast } from '@/components/ui/toast-store'
import { ApiError, api } from '@/lib/api'
import { shareInviteLink } from '@/lib/shareProfile'
import type { FollowUser } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { FlatList, View } from 'react-native'

// A member's followers or following list — the destination the profile
// stats trio (Seguidores / Siguiendo) and a member's own passport point to.
// Neither existed before M2: the counts were plain, untappable text, so a
// member could see they had 14 followers and never find out who.
type Tab = 'followers' | 'following'

export default function PeopleScreen() {
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
      toast({ variant: 'error', message: 'No se pudo abrir el enlace de invitación.' })
    }
  }

  const gone = q.error instanceof ApiError && q.error.status === 404

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          title: tab === 'followers' ? 'Seguidores' : 'Siguiendo',
          headerLargeTitle: false,
        }}
      />
      <View className="flex-row gap-2 px-5 pb-2 pt-3">
        <Chip
          size="sm"
          state={tab === 'followers' ? 'selected' : 'default'}
          onPress={() => setTab('followers')}
        >
          Seguidores
        </Chip>
        <Chip
          size="sm"
          state={tab === 'following' ? 'selected' : 'default'}
          onPress={() => setTab('following')}
        >
          Siguiendo
        </Chip>
      </View>

      {q.isPending ? (
        <RowsSkeleton />
      ) : q.isError ? (
        gone ? (
          <EmptyState>Este perfil no está disponible.</EmptyState>
        ) : (
          <ErrorState onRetry={() => q.refetch()}>No se pudo cargar la lista.</ErrorState>
        )
      ) : (
        <FlatList
          data={q.data?.users ?? []}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <PersonRow
              user={item}
              right={
                <FollowPill userId={item.id} initial={item.isFollowing} from="people_screen" />
              }
            />
          )}
          contentContainerClassName="px-5 pb-10"
          ListEmptyComponent={
            <EmptyState
              body={
                tab === 'followers'
                  ? 'Comparte tu invitación para que la gente empiece a seguirte.'
                  : 'Sigue a algunos amigos — sus rankings llenan tu feed.'
              }
              action={
                tab === 'followers' ? (
                  <Button size="sm" variant="secondary" onPress={inviteFriends}>
                    Invitar amigos
                  </Button>
                ) : undefined
              }
            >
              Nadie todavía.
            </EmptyState>
          }
        />
      )}
    </View>
  )
}
