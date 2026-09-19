import { Caption, EmptyState, ErrorState, RowsSkeleton, Segmented } from '@/components/ui'
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
// sub-switcher, the same Segmented control as the Lugares/Eventos switcher one
// level up. Everything else Explore normally shows
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
      <Segmented
        value={when}
        onChange={setWhen}
        options={[
          { value: 'tonight', label: t('events.tonight') },
          { value: 'weekend', label: t('events.weekend') },
          { value: 'upcoming', label: t('events.upcoming') },
        ]}
      />
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
      <Pressable className="mb-2 flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 active:opacity-80">
        <PlaceCover
          seed={e.id}
          name={e.title}
          coverImageId={e.coverImageId ?? e.restaurant.coverImageId}
          size={{ w: 200, h: 200 }}
          className="h-16 w-16 rounded-sm"
        />
        {/* Date on its own brass line ABOVE the title, not a right-hand
            column: that column took half the row and cut every title short
            ("Cata de W…"). */}
        <View className="flex-1">
          <Text
            className="font-ui-semibold text-eyebrow text-accent-strong uppercase tracking-eyebrow"
            numberOfLines={1}
          >
            {eventWhenLabel(e.startsAt)}
            {e.myRsvp === 'going' ? ` · ${t('events.going_pill')}` : ''}
          </Text>
          <Text className="mt-0.5 font-serif text-serif-sm text-text" numberOfLines={2}>
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
      </Pressable>
    </Link>
  )
}
