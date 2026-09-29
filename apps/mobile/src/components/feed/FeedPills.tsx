import { ScrollView } from 'react-native'

import { Chip } from '@/components/ui'
import { useT } from '@/lib/i18n'

// What the Feed is showing. "For you" is the mix (friends' rankings plus, later, a few
// people and places to meet); "Friends" is only friends' rankings, newest first;
// "Events" and "Lists" are the two other doors into the app that used to be rails.
export type FeedView = 'for_you' | 'friends' | 'events' | 'lists'
export const FEED_VIEWS: FeedView[] = ['for_you', 'friends', 'events', 'lists']
const LABEL = {
  for_you: 'feed.pill_for_you',
  friends: 'feed.pill_friends',
  events: 'feed.pill_events',
  lists: 'feed.pill_lists',
} as const

// One row of pills. Rendered twice by the Feed: inline under the greeting, and again
// inside a glass bar that pins to the top once the inline one has scrolled away.
export function FeedPills({
  value,
  onChange,
}: {
  value: FeedView
  onChange: (v: FeedView) => void
}) {
  const t = useT()
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-2 px-5"
    >
      {FEED_VIEWS.map((v) => (
        <Chip key={v} state={value === v ? 'selected' : 'default'} onPress={() => onChange(v)}>
          {t(LABEL[v])}
        </Chip>
      ))}
    </ScrollView>
  )
}
