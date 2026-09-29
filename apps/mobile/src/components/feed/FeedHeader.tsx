import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton, MAX_SCALE, Serif } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { BellIcon, SearchIcon } from '@/components/ui/icons'
import { useProfile } from '@/hooks/useProfile'
import { useUnseenActivity } from '@/hooks/useUnseenActivity'
import { dayPart } from '@/lib/greeting'
import { useT } from '@/lib/i18n'

// The Feed's top: your avatar (→ your profile), a search chip (→ Explore's search) and
// the bell (with a burgundy dot when there is something unseen), then a greeting that
// follows the time of day. No wordmark — the greeting is the header.
export function FeedHeader() {
  const t = useT()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const me = useProfile(true).data?.profile
  const unseen = useUnseenActivity()
  const part = dayPart()
  const first = (me?.name || me?.handle || '').trim().split(/\s+/)[0]
  const greeting = first
    ? t(`feed.greeting_${part}`, { name: first })
    : t(`feed.greeting_${part}_anon`)
  return (
    <View className="px-5" style={{ paddingTop: insets.top + 8 }}>
      <View className="h-[42px] flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tabs.profile')}
          onPress={() => router.push('/profile')}
          hitSlop={6}
          className="active:opacity-70"
        >
          <Avatar name={me?.name || me?.handle || 'm'} src={me?.image} size={42} />
        </Pressable>
        <View className="flex-row gap-2">
          <IconButton
            icon={<SearchIcon size={19} />}
            accessibilityLabel={t('feed.search')}
            onPress={() => router.push('/explore?focus=1')}
          />
          <IconButton
            icon={<BellIcon size={19} />}
            accessibilityLabel={
              unseen > 0 ? t('nav.activity_unseen', { n: unseen }) : t('nav.activity')
            }
            dot={unseen > 0}
            onPress={() => router.push('/activity')}
          />
        </View>
      </View>
      <View className="pb-4 pt-4">
        <Serif maxFontSizeMultiplier={MAX_SCALE} className="text-greeting text-text">
          {greeting}
        </Serif>
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className="mt-1.5 font-ui text-subhead text-text-muted"
        >
          {t(part === 'evening' ? 'feed.tagline_night' : 'feed.tagline_day')}
        </Text>
      </View>
    </View>
  )
}
