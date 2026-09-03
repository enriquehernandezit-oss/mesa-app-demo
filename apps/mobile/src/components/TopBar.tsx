import { Wordmark } from '@/components/ui'
import { BellIcon, SettingsIcon, ShareIcon, TrophyIcon } from '@/components/ui/icons'
import { useUnseenActivity } from '@/hooks/useUnseenActivity'
import { shareProfile } from '@/lib/shareProfile'
import { Link } from 'expo-router'
import { Pressable, View } from 'react-native'
import { Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Persistent app bar over the tab shell. Discover variant: wordmark + leaderboard
// + activity bell (with an unseen badge). Profile variant: the member's name +
// share + settings. Ported from apps/app/src/components/TopBar.tsx; share wires
// up in N6.
function Btn({ children }: { children: React.ReactNode }) {
  return (
    <View className="h-[44px] w-[44px] items-center justify-center rounded-pill active:opacity-70">
      {children}
    </View>
  )
}

// The bell + its unseen badge — activity newer than the local "seen" watermark
// (advanced by the Activity screen's "Marcar leído"). The ['activity'] query is
// shared with the Activity screen, so opening it and marking read updates both.
function ActivityBell() {
  const unseen = useUnseenActivity()
  return (
    <Link href="/activity" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unseen > 0 ? `Actividad, ${unseen} sin ver` : 'Actividad'}
      >
        <Btn>
          <BellIcon size={19} color="text" />
          {unseen > 0 && (
            <View className="absolute right-1.5 top-1.5 min-w-[16px] items-center justify-center rounded-pill bg-status-packed px-1">
              <Text className="font-mono text-micro text-on-accent">
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
}: { variant?: 'discover' | 'profile'; title?: string; shareHandle?: string | null }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      className="flex-row items-center justify-between px-5"
      style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
    >
      {variant === 'profile' ? (
        <Text className="font-serif-semibold text-serif-md text-text">{title || 'Tú'}</Text>
      ) : (
        <Wordmark size={22} />
      )}
      <View className="flex-row gap-2">
        {variant === 'profile' ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Compartir perfil"
              onPress={() => shareProfile(shareHandle)}
            >
              <Btn>
                <ShareIcon size={19} color="text" />
              </Btn>
            </Pressable>
            <Link href="/settings" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="Ajustes">
                <Btn>
                  <SettingsIcon size={19} color="text" />
                </Btn>
              </Pressable>
            </Link>
          </>
        ) : (
          <>
            <Link href="/leaderboard" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="Clasificación">
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
