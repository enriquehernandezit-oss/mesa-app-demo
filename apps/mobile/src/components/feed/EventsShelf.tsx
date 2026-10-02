import { ScrollView, Text, View } from 'react-native'

import { EventMiniCard, useNow } from '@/components/events/EventTicket'
import { MAX_SCALE, SectionHeader } from '@/components/ui'
import { countdown } from '@/lib/eventTime'
import { useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'

// "Events this week": a shelf of event cards between friend cards, the way "People you may know" is
// a shelf of people — scroll across, tap one and its page opens. The cards are Eventos' own compact
// card (a date badge, the countdown, the kind's icon, the title, place · time); "See all" goes to the
// Events view. What goes in the shelf is lib/eventTime's eventsThisWeek and lib/feedRows' placement;
// this only draws it, and drops an event that has ended since the list was built.
export function EventsShelf({
  events,
  onSeeAll,
}: {
  events: EventSummary[]
  onSeeAll: () => void
}) {
  const t = useT()
  const now = useNow()
  const upcoming = events.filter((e) => countdown(e.startsAt, e.endsAt, now).kind !== 'ended')
  if (upcoming.length === 0) return null
  return (
    <View className="mb-2 mt-1">
      <View className="px-5">
        <SectionHeader
          action={
            <Text
              accessibilityRole="button"
              onPress={onSeeAll}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-medium text-pill text-text-muted"
            >
              {t('feed.see_all')}
            </Text>
          }
        >
          {t('feed.events_this_week')}
        </SectionHeader>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2.5 px-4 pb-3"
      >
        {upcoming.map((e) => (
          <EventMiniCard key={e.id} e={e} now={now} />
        ))}
      </ScrollView>
    </View>
  )
}
