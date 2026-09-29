import { useRouter } from 'expo-router'
import { Animated, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton, MAX_SCALE } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { SettingsIcon, ShareIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { useT } from '@/lib/i18n'
import { shareProfile } from '@/lib/shareProfile'

// The Profile tab's top controls: a round Share and Settings chip at the right, always. Once the
// page has scrolled past the identity block a glass bar fades in behind them carrying the name,
// so the chips never sit on content. `scrollY` is the page's own scroll offset (native-driven).
export const PROFILE_HEADER_CONTENT = 42

export function useProfileHeaderHeight(): number {
  return useSafeAreaInsets().top + 8 + PROFILE_HEADER_CONTENT
}

export function ProfileHeader({
  name,
  handle,
  scrollY,
}: {
  name: string
  handle?: string | null
  scrollY: Animated.Value
}) {
  const t = useT()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const bar = scrollY.interpolate({
    inputRange: [50, 110],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-0">
      <Animated.View pointerEvents="none" style={{ opacity: bar }}>
        <Glass
          solid
          variant="bar"
          radius={0}
          style={{
            borderWidth: 0,
            borderBottomWidth: 1,
            paddingTop: insets.top + 8,
            height: insets.top + 8 + PROFILE_HEADER_CONTENT + 10,
            paddingHorizontal: 108,
          }}
        >
          <View className="h-[42px] items-center justify-center">
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_SCALE}
              className="font-ui-semibold text-body text-text"
            >
              {name}
            </Text>
          </View>
        </Glass>
      </Animated.View>
      <View
        pointerEvents="box-none"
        className="absolute right-4 flex-row gap-2"
        style={{ top: insets.top + 8 }}
      >
        <IconButton
          accessibilityLabel={t('nav.share_profile')}
          onPress={() => {
            // Without a handle, the share link falls back to the bare API origin — a "share your
            // profile" that silently shares a link to nothing. Edit profile is one tap away.
            if (!handle) {
              toast({ message: t('nav.share_profile_no_handle') })
              return
            }
            shareProfile(handle)
          }}
          icon={<ShareIcon size={19} color="text" />}
        />
        <IconButton
          accessibilityLabel={t('nav.settings')}
          onPress={() => router.push('/settings')}
          icon={<SettingsIcon size={19} color="text" />}
        />
      </View>
    </View>
  )
}
