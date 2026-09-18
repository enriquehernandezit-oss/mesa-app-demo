import { Caption, Chip, EmptyState, ErrorState, RowsSkeleton } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { PlaceCover } from '@/components/ui/PlaceCover'
import { api } from '@/lib/api'
import { eventWhenLabel } from '@/lib/display'
import { useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

type When = 'tonight' | 'weekend' | 'upcoming'

// Explore's "Eventos" view (M21) — its own tonight/weekend/upcoming
// sub-switcher, same plain-Chip-row idiom as the Lugares/Eventos switcher one
// level up (see explore/index.tsx's own comment on why this is a bare row of
// Chips, not a segmented control). Everything else Explore normally shows
// (filters, the trending rail, the Google gap-filler) is Lugares-only —
// there's no equivalent concept for a curated events calendar.
export function EventsBrowse() {
  const t = useT()
  const [when, setWhen] = useState<When>('upcoming')
  const q = useQuery({
    queryKey: ['events', when],
    queryFn: () => api.get<{ events: EventSummary[] }>(`/events?when=${when}`),
  })
  const list = q.data?.events ?? []

  return (
    <View className="mt-4">
      <View className="flex-row gap-2">
        <Chip
          size="sm"
          state={when === 'tonight' ? 'selected' : 'default'}
          onPress={() => setWhen('tonight')}
        >
          {t('events.tonight')}
        </Chip>
        <Chip
          size="sm"
          state={when === 'weekend' ? 'selected' : 'default'}
          onPress={() => setWhen('weekend')}
        >
          {t('events.weekend')}
        </Chip>
        <Chip
          size="sm"
          state={when === 'upcoming' ? 'selected' : 'default'}
          onPress={() => setWhen('upcoming')}
        >
          {t('events.upcoming')}
        </Chip>
      </View>
      <View className="mt-3">
        {q.isPending ? (
          <RowsSkeleton rows={3} thumb={56} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>{t('events.load_error')}</ErrorState>
        ) : list.length === 0 ? (
          <EmptyState>{t('events.empty')}</EmptyState>
        ) : (
          list.map((e) => <EventRow key={e.id} e={e} />)
        )}
      </View>
    </View>
  )
}

export function EventRow({ e }: { e: EventSummary }) {
  const t = useT()
  return (
    <Link href={`/eventos/${e.id}`} asChild>
      <Pressable className="flex-row items-center gap-3 border-line border-b py-3 active:opacity-80">
        <PlaceCover
          seed={e.id}
          name={e.title}
          coverImageId={e.coverImageId ?? e.restaurant.coverImageId}
          size={{ w: 200, h: 200 }}
          className="h-14 w-14"
        />
        <View className="flex-1">
          <Text className="font-serif text-serif-sm text-text" numberOfLines={1}>
            {e.title}
          </Text>
          <Caption numberOfLines={1}>
            {[e.restaurant.name, e.restaurant.neighborhood].filter(Boolean).join(' · ')}
          </Caption>
          {e.friendsGoing.length > 0 && (
            <View className="mt-1 flex-row items-center gap-1">
              {e.friendsGoing.map((f) => (
                <Avatar key={f.id} name={f.name} src={f.image} size={20} />
              ))}
              <Caption className="ml-1">
                {t('events.friends_going_count', { n: e.goingCount })}
              </Caption>
            </View>
          )}
        </View>
        <View className="items-end">
          <Text className="font-ui-medium text-label text-text-2" numberOfLines={1}>
            {eventWhenLabel(e.startsAt)}
          </Text>
          {e.myRsvp === 'going' && (
            <Text className="mt-0.5 font-ui-semibold text-eyebrow text-accent-strong uppercase tracking-eyebrow">
              {t('events.going_pill')}
            </Text>
          )}
        </View>
      </Pressable>
    </Link>
  )
}
