import { View } from 'react-native'

import { EventHeroPager } from '@/components/events/EventHero'
import { useNow } from '@/components/events/EventTicket'
import { Caption, SectionHeader } from '@/components/ui'
import { countdown } from '@/lib/eventTime'
import { useT } from '@/lib/i18n'
import type { EventSummary } from '@/lib/types'

// "Tonight": the events on tonight, as one big photo card at a time (components/events/EventHero).
//
// The list is the server's, cached until 5 AM (lib/homeCache.ts), so an event that has
// ended since is dropped here rather than waiting for a refetch.
export function TonightHero({ events }: { events: EventSummary[] }) {
  const t = useT()
  const now = useNow()
  const upcoming = events.filter((e) => countdown(e.startsAt, e.endsAt, now).kind !== 'ended')
  if (upcoming.length === 0) return null
  return (
    <View>
      <View className="px-5">
        <SectionHeader
          action={<Caption>{t('home.tonight_events', { n: upcoming.length })}</Caption>}
        >
          {t('home.tonight')}
        </SectionHeader>
      </View>
      <EventHeroPager events={upcoming} height={372} now={now} />
    </View>
  )
}
