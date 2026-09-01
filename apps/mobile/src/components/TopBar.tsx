import { Wordmark } from '@/components/ui'
import { PersonIcon, SettingsIcon, ShareIcon } from '@/components/ui/icons'
import { Link } from 'expo-router'
import { Pressable, View } from 'react-native'
import { Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Persistent app bar over the tab shell. Discover variant: wordmark + leaderboard
// + activity bell. Profile variant: the member's name + share + settings. Ported
// from apps/app/src/components/TopBar.tsx; the unseen-activity badge lands with
// the Activity screen (N5), and share wires up in N6.
function Btn({ children }: { children: React.ReactNode }) {
  return (
    <View className="h-[44px] w-[44px] items-center justify-center rounded-pill active:opacity-70">
      {children}
    </View>
  )
}

export function TopBar({
  variant = 'discover',
  title,
}: { variant?: 'discover' | 'profile'; title?: string }) {
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
            <Btn>
              <ShareIcon size={19} color="text" />
            </Btn>
            <Link href="/settings" asChild>
              <Pressable>
                <Btn>
                  <SettingsIcon size={19} color="text" />
                </Btn>
              </Pressable>
            </Link>
          </>
        ) : (
          <>
            <Link href="/leaderboard" asChild>
              <Pressable>
                <Btn>
                  <PersonIcon size={19} color="text" />
                </Btn>
              </Pressable>
            </Link>
            <Link href="/activity" asChild>
              <Pressable>
                <Btn>
                  <PersonIcon size={19} color="text" />
                </Btn>
              </Pressable>
            </Link>
          </>
        )}
      </View>
    </View>
  )
}
