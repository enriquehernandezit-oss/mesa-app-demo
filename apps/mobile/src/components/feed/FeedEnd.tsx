import { useRouter } from 'expo-router'
import { View } from 'react-native'

import { Body, Button, Serif } from '@/components/ui'
import { useT } from '@/lib/i18n'
import { useLift } from '@/theme/useLift'

// The bottom of the Feed: you've seen everything your friends ranked. Two ways on —
// look at what the rest of the city loves, or bring more friends to the table.
export function FeedEnd() {
  const t = useT()
  const router = useRouter()
  const lift = useLift()
  return (
    <View
      className="mx-4 mt-3.5 items-center rounded-[28px] bg-surface px-5 pb-5 pt-6"
      style={lift}
    >
      <Serif className="text-center text-title text-text">{t('feed.end_title')}</Serif>
      <Body className="mt-2 text-center text-subhead text-text-muted">{t('feed.end_body')}</Body>
      <View className="mt-[18px] w-full flex-row gap-2">
        <Button size="sm" className="flex-1" onPress={() => router.push('/explore')}>
          {t('feed.end_explore')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          onPress={() => router.push('/friends')}
        >
          {t('feed.end_find_friends')}
        </Button>
      </View>
    </View>
  )
}
