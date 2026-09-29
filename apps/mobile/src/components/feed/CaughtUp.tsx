import { Text, View } from 'react-native'

import { useT } from '@/lib/i18n'

// "You're caught up · older below" — a hairline, the words, a hairline: where what
// you'd already seen begins.
export function CaughtUp() {
  const t = useT()
  return (
    <View className="flex-row items-center gap-2.5 px-6 pb-3.5 pt-2.5">
      <View className="h-px flex-1 bg-line" />
      <Text className="font-ui text-label text-text-muted">{t('feed.caught_up')}</Text>
      <View className="h-px flex-1 bg-line" />
    </View>
  )
}
