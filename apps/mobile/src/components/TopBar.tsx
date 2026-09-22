import { Link } from 'expo-router'
import { Pressable, View } from 'react-native'
import { Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Wordmark } from '@/components/ui'
import { BellIcon, SettingsIcon, ShareIcon, TrophyIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { useUnseenActivity } from '@/hooks/useUnseenActivity'
import { useT } from '@/lib/i18n'
import { shareProfile } from '@/lib/shareProfile'

// Persistent app bar over the tab shell. Discover variant: wordmark + leaderboard
// + activity bell (with an unseen badge). Profile variant: the member's name +
// share + settings. Ported from apps/app/src/components/TopBar.tsx; share wires
// up in N6.
// Sizing only — press feedback lives on the wrapping Pressable. A plain View
// carrying an `active:` variant gets silently upgraded by NativeWind into its
// OWN Pressable (react-native-css-interop upgrades any View with a
// hover/active/focus variant), which used to sit *inside* the real one and
// absorb every tap before the real Pressable's onPress ever fired — every
// button below was dead. Keep `active:` off this View.
function Btn({ children }: { children: React.ReactNode }) {
  return (
    <View className="h-[44px] w-[44px] items-center justify-center rounded-pill">{children}</View>
  )
}

// The bell + its unseen badge — activity newer than the local "seen" watermark
// (advanced by the Activity screen's "Marcar leído"). The ['activity'] query is
// shared with the Activity screen, so opening it and marking read updates both.
function ActivityBell() {
  const t = useT()
  const unseen = useUnseenActivity()
  return (
    <Link href="/activity" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          unseen > 0 ? t('nav.activity_unseen', { n: unseen }) : t('nav.activity')
        }
        className="active:opacity-70"
      >
        <Btn>
          <BellIcon size={19} color="text" />
          {unseen > 0 && (
            <View className="absolute right-1.5 top-1.5 min-w-[16px] items-center justify-center rounded-pill bg-status-packed px-1">
              <Text className="font-ui-semibold text-[10px] text-on-accent leading-[14px]">
                {unseen > 9 ? '9+' : unseen}
              </Text>
            </View>
          )}
        </Btn>
      </Pressable>
    </Link>
  )
}

export function TopBar({
  variant = 'discover',
  title,
  shareHandle,
}: {
  variant?: 'discover' | 'profile'
  title?: string
  shareHandle?: string | null
}) {
  const t = useT()
  const insets = useSafeAreaInsets()
  return (
    <View
      className="flex-row items-center justify-between px-5"
      style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
    >
      {variant === 'profile' ? (
        <Text className="font-serif-semibold text-serif-md text-text">
          {title || t('common.you')}
        </Text>
      ) : (
        <Wordmark size={22} />
      )}
      <View className="flex-row gap-2">
        {variant === 'profile' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('nav.share_profile')}
              onPress={() => {
                // Without a handle, `profileShareLink` falls back to the bare
                // API origin — a "share your profile" that silently shares a
                // link to nothing. This variant only ever renders on the
                // Profile tab, so "Editar perfil" is already on screen below.
                if (!shareHandle) {
                  toast({ message: t('nav.share_profile_no_handle') })
                  return
                }
                shareProfile(shareHandle)
              }}
              className="active:opacity-70"
            >
              <Btn>
                <ShareIcon size={19} color="text" />
              </Btn>
            </Pressable>
            {/* The tab bar's unseen-activity badge lands on the Profile tab
                (MesaTabBar.tsx), but until now this variant had no bell at
                all — tapping the badge opened a screen with no way to reach
                Activity. Same bell, same unseen count, as the discover
                variant below. */}
            <ActivityBell />
            <Link href="/settings" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('nav.settings')}
                className="active:opacity-70"
              >
                <Btn>
                  <SettingsIcon size={19} color="text" />
                </Btn>
              </Pressable>
            </Link>
          </>
        ) : (
          <>
            <Link href="/leaderboard" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('nav.leaderboard')}
                className="active:opacity-70"
              >
                <Btn>
                  <TrophyIcon size={19} color="text" />
                </Btn>
              </Pressable>
            </Link>
            <ActivityBell />
          </>
        )}
      </View>
    </View>
  )
}
